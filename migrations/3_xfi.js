/* global artifacts */

'use strict';

const XFIToken = artifacts.require('XFIToken');

module.exports = function (deployer) {
    if (!process.env.XFI_MOCK) {
        return;
    }

    const CREATOR_ADDRESS = process.env.CREATOR_ADDRESS;

    if (!CREATOR_ADDRESS) {
        throw 'CREATOR_ADDRESS is missing';
    }

    // Deploy the XFI Token.
    deployer.deploy(XFIToken, {from: CREATOR_ADDRESS});
};
