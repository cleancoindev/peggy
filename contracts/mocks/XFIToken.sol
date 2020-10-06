// SPDX-License-Identifier: MIT

pragma solidity ^0.6.11;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/access/AccessControl.sol';

contract XFIToken is ERC20, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256('minter');

    constructor () public ERC20('XFI', 'XFI') {
        _mint(msg.sender, 1e26);
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * Creates `amount` tokens and assigns them to `account`, increasing
     * the total supply.
     *
     * Emits a {Transfer} event with `from` set to the zero address.
     *
     * Requirements:
     * - Caller must have minter role.
     * - `account` cannot be the zero address.
     */
    function mint(address account, uint256 amount) external returns (bool) {
        require(hasRole(MINTER_ROLE, msg.sender), 'XFIToken: sender is not minter');

        _mint(account, amount);

        return true;
    }
}
