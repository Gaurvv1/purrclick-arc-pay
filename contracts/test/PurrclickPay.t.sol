// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {PurrclickPay} from "../PurrclickPay.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

contract PurrclickPayTest is Test {
    // ─────────────── fixtures ───────────────────────────────────────────────
    PurrclickPay internal pay;
    MockERC20 internal usdc;

    address internal deployer = makeAddr("deployer");
    address internal treasury = makeAddr("treasury");
    address internal alice    = makeAddr("alice");
    address internal referrer = makeAddr("referrer");

    uint256 internal constant PRICE     = 3_000_000; // $3.00 in USDC (6 dec)
    uint16  internal constant REF_BPS   = 2000;      // default 20 %
    bytes32 internal constant ORDER_1   = keccak256("order-1");
    bytes32 internal constant ORDER_2   = keccak256("order-2");

    // ─────────────── helpers ────────────────────────────────────────────────

    /// @dev Fund alice with `amount` USDC and approve the contract to spend it.
    function _fund(address buyer, uint256 amount) internal {
        usdc.mint(buyer, amount);
        vm.prank(buyer);
        usdc.approve(address(pay), amount);
    }

    // ─────────────── setUp ──────────────────────────────────────────────────

    function setUp() public {
        vm.startPrank(deployer);

        usdc = new MockERC20("Mock USDC", "mUSDC", 6);
        pay  = new PurrclickPay(deployer, treasury, PRICE, address(usdc));

        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 1. Deployment & initialization
    // ═══════════════════════════════════════════════════════════════════════

    function test_Deploy_SetsStateCorrectly() public view {
        assertEq(pay.owner(),       deployer);
        assertEq(pay.treasury(),    treasury);
        assertEq(pay.price(),       PRICE);
        assertEq(pay.referralBps(), REF_BPS);
        assertEq(address(pay.usdc()), address(usdc));
    }

    function test_Deploy_RevertsZeroTreasury() public {
        vm.expectRevert(PurrclickPay.ZeroAddress.selector);
        new PurrclickPay(deployer, address(0), PRICE, address(usdc));
    }

    function test_Deploy_RevertsZeroUsdc() public {
        vm.expectRevert(PurrclickPay.ZeroAddress.selector);
        new PurrclickPay(deployer, treasury, PRICE, address(0));
    }

    function test_Deploy_RevertsZeroPrice() public {
        vm.expectRevert(PurrclickPay.InvalidPrice.selector);
        new PurrclickPay(deployer, treasury, 0, address(usdc));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 2. buy – normal (no referrer)
    // ═══════════════════════════════════════════════════════════════════════

    function test_Buy_NoReferrer_FullPriceToTreasury() public {
        _fund(alice, PRICE);

        vm.prank(alice);
        pay.buy(ORDER_1, address(0));

        // Full price lands at treasury; alice spent it all; referrer untouched
        assertEq(usdc.balanceOf(treasury), PRICE);
        assertEq(usdc.balanceOf(alice),    0);
    }

    function test_Buy_NoReferrer_MarksOrderPaid() public {
        _fund(alice, PRICE);

        vm.prank(alice);
        pay.buy(ORDER_1, address(0));

        assertTrue(pay.orderPaid(ORDER_1));
    }

    function test_Buy_NoReferrer_EmitsPaidEvent() public {
        _fund(alice, PRICE);

        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(pay));
        emit PurrclickPay.Paid(ORDER_1, alice, address(0), PRICE);
        pay.buy(ORDER_1, address(0));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 3. buy – with referrer (20 % / 80 % split)
    // ═══════════════════════════════════════════════════════════════════════

    function test_Buy_WithReferrer_SplitsCorrectly() public {
        _fund(alice, PRICE);

        uint256 expectedRef      = (PRICE * REF_BPS) / 10_000; // 600_000
        uint256 expectedTreasury = PRICE - expectedRef;         // 2_400_000

        vm.prank(alice);
        pay.buy(ORDER_1, referrer);

        assertEq(usdc.balanceOf(referrer),  expectedRef,      "referrer share wrong");
        assertEq(usdc.balanceOf(treasury),  expectedTreasury, "treasury share wrong");
        assertEq(usdc.balanceOf(alice),     0,                "alice balance should be 0");
    }

    function test_Buy_WithReferrer_SplitSumsToPrice() public {
        _fund(alice, PRICE);

        vm.prank(alice);
        pay.buy(ORDER_1, referrer);

        assertEq(
            usdc.balanceOf(referrer) + usdc.balanceOf(treasury),
            PRICE,
            "split must sum to price"
        );
    }

    function test_Buy_WithReferrer_EmitsPaidEvent() public {
        _fund(alice, PRICE);

        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(pay));
        emit PurrclickPay.Paid(ORDER_1, alice, referrer, PRICE);
        pay.buy(ORDER_1, referrer);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 4. buy – self-referral (referrer == buyer)
    // ═══════════════════════════════════════════════════════════════════════

    function test_Buy_SelfReferral_TreatedAsNoReferrer() public {
        _fund(alice, PRICE);

        vm.prank(alice);
        pay.buy(ORDER_1, alice); // self-referral

        // 100 % goes to treasury; alice gets nothing extra
        assertEq(usdc.balanceOf(treasury), PRICE, "full price must go to treasury");
        assertEq(usdc.balanceOf(alice),    0,     "alice should not get a referral share");
    }

    function test_Buy_SelfReferral_EmitsPaidWithSelfAsReferrer() public {
        _fund(alice, PRICE);

        // Contract emits the caller-supplied referrer address verbatim
        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(pay));
        emit PurrclickPay.Paid(ORDER_1, alice, alice, PRICE);
        pay.buy(ORDER_1, alice);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 5. buy – reused orderId
    // ═══════════════════════════════════════════════════════════════════════

    function test_Buy_DuplicateOrderId_Reverts() public {
        _fund(alice, PRICE * 2);

        vm.prank(alice);
        pay.buy(ORDER_1, address(0));

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PurrclickPay.OrderAlreadyPaid.selector, ORDER_1));
        pay.buy(ORDER_1, address(0));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 6. buy – paused
    // ═══════════════════════════════════════════════════════════════════════

    function test_Buy_WhenPaused_Reverts() public {
        _fund(alice, PRICE);

        vm.prank(deployer);
        pay.pause();

        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        pay.buy(ORDER_1, address(0));
    }

    function test_Buy_AfterUnpause_Succeeds() public {
        _fund(alice, PRICE);

        vm.prank(deployer);
        pay.pause();

        vm.prank(deployer);
        pay.unpause();

        vm.prank(alice);
        pay.buy(ORDER_1, address(0)); // should not revert

        assertEq(usdc.balanceOf(treasury), PRICE);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 7. buy – wrong amount (insufficient allowance)
    // ═══════════════════════════════════════════════════════════════════════

    function test_Buy_InsufficientAllowance_Reverts() public {
        // Mint but approve nothing
        usdc.mint(alice, PRICE);
        // No approve → allowance is 0

        vm.prank(alice);
        vm.expectRevert("insufficient allowance");
        pay.buy(ORDER_1, address(0));
    }

    function test_Buy_InsufficientBalance_Reverts() public {
        // Approve but no balance
        vm.prank(alice);
        usdc.approve(address(pay), PRICE);
        // No mint → balance is 0

        vm.prank(alice);
        vm.expectRevert("insufficient balance");
        pay.buy(ORDER_1, address(0));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 8. Access control – non-owner calls revert
    // ═══════════════════════════════════════════════════════════════════════

    function test_SetPrice_NonOwner_Reverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        pay.setPrice(5_000_000);
    }

    function test_SetTreasury_NonOwner_Reverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        pay.setTreasury(alice);
    }

    function test_SetReferralBps_NonOwner_Reverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        pay.setReferralBps(1000);
    }

    function test_Pause_NonOwner_Reverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        pay.pause();
    }

    function test_Unpause_NonOwner_Reverts() public {
        vm.prank(deployer);
        pay.pause();

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        pay.unpause();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 9. setPrice – validation & happy path
    // ═══════════════════════════════════════════════════════════════════════

    function test_SetPrice_Zero_Reverts() public {
        vm.prank(deployer);
        vm.expectRevert(PurrclickPay.InvalidPrice.selector);
        pay.setPrice(0);
    }

    function test_SetPrice_HappyPath_EmitsPriceSet() public {
        vm.prank(deployer);
        vm.expectEmit(false, false, false, true, address(pay));
        emit PurrclickPay.PriceSet(5_000_000);
        pay.setPrice(5_000_000);

        assertEq(pay.price(), 5_000_000);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 10. setTreasury – validation & happy path
    // ═══════════════════════════════════════════════════════════════════════

    function test_SetTreasury_ZeroAddress_Reverts() public {
        vm.prank(deployer);
        vm.expectRevert(PurrclickPay.ZeroAddress.selector);
        pay.setTreasury(address(0));
    }

    function test_SetTreasury_HappyPath_EmitsTreasurySet() public {
        address newTreasury = makeAddr("newTreasury");

        vm.prank(deployer);
        vm.expectEmit(true, false, false, true, address(pay));
        emit PurrclickPay.TreasurySet(newTreasury);
        pay.setTreasury(newTreasury);

        assertEq(pay.treasury(), newTreasury);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 11. setReferralBps – validation & happy path
    // ═══════════════════════════════════════════════════════════════════════

    function test_SetReferralBps_ExceedsMax_Reverts() public {
        vm.prank(deployer);
        vm.expectRevert(abi.encodeWithSelector(PurrclickPay.BpsExceedsMax.selector, uint16(3001)));
        pay.setReferralBps(3001);
    }

    function test_SetReferralBps_ExactlyMax_Succeeds() public {
        vm.prank(deployer);
        pay.setReferralBps(3000);
        assertEq(pay.referralBps(), 3000);
    }

    function test_SetReferralBps_Zero_Succeeds() public {
        vm.prank(deployer);
        pay.setReferralBps(0);
        assertEq(pay.referralBps(), 0);
    }

    function test_SetReferralBps_HappyPath_EmitsReferralBpsSet() public {
        vm.prank(deployer);
        vm.expectEmit(false, false, false, true, address(pay));
        emit PurrclickPay.ReferralBpsSet(1500);
        pay.setReferralBps(1500);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 12. pause / unpause – happy paths
    // ═══════════════════════════════════════════════════════════════════════

    function test_Pause_Owner_SucceedsAndEmits() public {
        vm.prank(deployer);
        vm.expectEmit(false, false, false, false, address(pay));
        emit Pausable.Paused(deployer);
        pay.pause();

        assertTrue(pay.paused());
    }

    function test_Unpause_Owner_SucceedsAndEmits() public {
        vm.prank(deployer);
        pay.pause();

        vm.prank(deployer);
        vm.expectEmit(false, false, false, false, address(pay));
        emit Pausable.Unpaused(deployer);
        pay.unpause();

        assertFalse(pay.paused());
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 13. Fuzz: referralBps split always sums to price
    // ═══════════════════════════════════════════════════════════════════════

    /// @dev For any valid bps in [0, 3000] the referral + treasury portions
    ///      must equal price exactly.
    function testFuzz_ReferralSplitSumsToPrice(uint16 bps) public {
        bps = uint16(bound(uint256(bps), 0, 3000));

        // Update bps as owner
        vm.prank(deployer);
        pay.setReferralBps(bps);

        // Fund alice for one purchase
        _fund(alice, PRICE);

        uint256 refBalBefore      = usdc.balanceOf(referrer);
        uint256 treasuryBalBefore = usdc.balanceOf(treasury);

        vm.prank(alice);
        pay.buy(ORDER_1, referrer);

        uint256 refGain      = usdc.balanceOf(referrer)  - refBalBefore;
        uint256 treasuryGain = usdc.balanceOf(treasury)  - treasuryBalBefore;

        assertEq(refGain + treasuryGain, PRICE, "split must always sum to price");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 14. Fuzz: no referrer path always sends full price to treasury
    // ═══════════════════════════════════════════════════════════════════════

    /// @dev Regardless of bps setting, no-referrer buys always land full price
    ///      at treasury.
    function testFuzz_NoReferrer_FullPriceToTreasury(uint16 bps) public {
        bps = uint16(bound(uint256(bps), 0, 3000));

        vm.prank(deployer);
        pay.setReferralBps(bps);

        _fund(alice, PRICE);

        uint256 treasuryBalBefore = usdc.balanceOf(treasury);

        vm.prank(alice);
        pay.buy(ORDER_1, address(0));

        assertEq(
            usdc.balanceOf(treasury) - treasuryBalBefore,
            PRICE,
            "full price must reach treasury"
        );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 15. Paid event field verification
    // ═══════════════════════════════════════════════════════════════════════

    function test_PaidEvent_AllFieldsCorrect_NoReferrer() public {
        _fund(alice, PRICE);

        // orderId, buyer indexed; referrer, amount in data
        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(pay));
        emit PurrclickPay.Paid(ORDER_1, alice, address(0), PRICE);
        pay.buy(ORDER_1, address(0));
    }

    function test_PaidEvent_AllFieldsCorrect_WithReferrer() public {
        _fund(alice, PRICE);

        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(pay));
        emit PurrclickPay.Paid(ORDER_1, alice, referrer, PRICE);
        pay.buy(ORDER_1, referrer);
    }

    function test_PaidEvent_AmountIsAlwaysPrice() public {
        // Even after price change the emitted amount reflects the current price
        uint256 newPrice = 5_000_000;

        vm.prank(deployer);
        pay.setPrice(newPrice);

        _fund(alice, newPrice);

        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(pay));
        emit PurrclickPay.Paid(ORDER_1, alice, address(0), newPrice);
        pay.buy(ORDER_1, address(0));
    }
}
