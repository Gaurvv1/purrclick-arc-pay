// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title PurrclickPay
/// @notice Accepts USDC payments for Purrclick orders and optionally pays a referral share.
/// @dev Uses plain IERC20.transferFrom checks and never custody-holds funds.
contract PurrclickPay is Ownable, Pausable {
    /// @notice Thrown when a zero address is provided where non-zero is required.
    error ZeroAddress();

    /// @notice Thrown when a price is zero.
    error InvalidPrice();

    /// @notice Thrown when referral basis points exceed the allowed maximum.
    /// @param bps The provided referral basis points.
    error BpsExceedsMax(uint16 bps);

    /// @notice Thrown when an order is attempted to be paid more than once.
    /// @param orderId The already-paid order identifier.
    error OrderAlreadyPaid(bytes32 orderId);

    /// @notice Emitted when an order is paid.
    /// @param orderId The order identifier.
    /// @param buyer The buyer paying for the order.
    /// @param referrer The referrer as provided in the call.
    /// @param amount The total payment amount in USDC 6-decimal units.
    event Paid(bytes32 indexed orderId, address indexed buyer, address referrer, uint256 amount);

    /// @notice Emitted when the unit price is updated.
    /// @param newPrice The new price in USDC 6-decimal units.
    event PriceSet(uint256 newPrice);

    /// @notice Emitted when treasury address is updated.
    /// @param newTreasury The new treasury address.
    event TreasurySet(address indexed newTreasury);

    /// @notice Emitted when referral basis points are updated.
    /// @param newBps The new referral basis points.
    event ReferralBpsSet(uint16 newBps);

    /// @notice Recipient of treasury proceeds.
    address public treasury;

    /// @notice Price per order in USDC 6-decimal units (e.g., 3_000_000 = $3).
    uint256 public price;

    /// @notice Referral share in basis points. Defaults to 2000 (20%).
    uint16 public referralBps = 2000;

    /// @notice USDC token used for payments.
    IERC20 public immutable usdc;

    /// @notice Tracks whether an orderId has already been paid.
    mapping(bytes32 => bool) public orderPaid;

    /// @notice Initializes ownership and payment settings.
    /// @param initialOwner The owner account for administrative controls.
    /// @param treasury_ Treasury address that receives payment proceeds.
    /// @param price_ Price per order in USDC 6-decimal units.
    /// @param usdc_ ERC-20 token address used for payment (USDC).
    constructor(address initialOwner, address treasury_, uint256 price_, address usdc_) Ownable(initialOwner) {
        if (treasury_ == address(0) || usdc_ == address(0)) revert ZeroAddress();
        if (price_ == 0) revert InvalidPrice();

        treasury = treasury_;
        price = price_;
        usdc = IERC20(usdc_);
    }

    /// @notice Pays for an order in USDC and optionally routes a referral share.
    /// @param orderId Unique order identifier.
    /// @param referrer Referral recipient candidate.
    function buy(bytes32 orderId, address referrer) external whenNotPaused {
        if (orderPaid[orderId]) revert OrderAlreadyPaid(orderId);

        orderPaid[orderId] = true;

        emit Paid(orderId, msg.sender, referrer, price);

        if (referrer != address(0) && referrer != msg.sender) {
            uint256 referralAmount = (price * referralBps) / 10_000;
            uint256 treasuryAmount = price - referralAmount;

            require(usdc.transferFrom(msg.sender, referrer, referralAmount), "USDC transfer failed");
            require(usdc.transferFrom(msg.sender, treasury, treasuryAmount), "USDC transfer failed");
        } else {
            require(usdc.transferFrom(msg.sender, treasury, price), "USDC transfer failed");
        }
    }

    /// @notice Updates the order price.
    /// @param newPrice New price in USDC 6-decimal units.
    function setPrice(uint256 newPrice) external onlyOwner {
        if (newPrice == 0) revert InvalidPrice();
        price = newPrice;
        emit PriceSet(newPrice);
    }

    /// @notice Updates treasury destination.
    /// @param newTreasury New treasury address.
    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        treasury = newTreasury;
        emit TreasurySet(newTreasury);
    }

    /// @notice Updates referral share basis points.
    /// @param newBps New referral basis points. Maximum is 3000.
    function setReferralBps(uint16 newBps) external onlyOwner {
        if (newBps > 3000) revert BpsExceedsMax(newBps);
        referralBps = newBps;
        emit ReferralBpsSet(newBps);
    }

    /// @notice Pauses purchases.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpauses purchases.
    function unpause() external onlyOwner {
        _unpause();
    }
}
