/* global artifacts */

'use strict';

const path = require('path');

require('dotenv').config({path: path.resolve(__dirname, '..', '.env')});

const Web3  = require('Web3');
const sigs  = require('../test/lib/signatures'); // FIXME

const Peggy = artifacts.require('Peggy');

const {
    makeCheckpointSignature,
    makeCheckpoint
} = sigs;

const web3 = new Web3();

module.exports = async (deployer) => {
    if (!process.env.PEGGY) {
        return;
    }

    if (!process.env.CREATOR_ADDRESS) {
        throw "'CREATOR_ADDRESS' parameter missed";
    }

    // need validator private keys addresses.
    if (!process.env.PRIVATE_KEYS) {
        throw "'PRIVATE_KEYS' parameter missed";
    }

    if (!process.env.POWERS) {
        throw "'POWERS' parameter missed";
    }

    if (!process.env.PEGGY_ID) {
        throw "'PEGGY_ID' parameter missed";
    }

    if (!process.env.POWER_THRESHOLD) {
        throw "'POWER_THRESHOLD' parameter missed";
    }

    if (!process.env.XFI_TOKEN_ADDRESS) {
        throw "'XFI_TOKEN_ADDRESS' parameter missed";
    }

    const peggyId = Buffer.from(web3.utils.keccak256(process.env.PEGGY_ID).slice(2), 'hex');

    const privateKeys    = process.env.PRIVATE_KEYS.split(',');
    const powers         = process.env.POWERS.split(',');
    const totalPower     = powers.map(v => parseInt(v)).reduce((a, b) => a + b, 0);
    const validators     = [];
    const powerThreshold = parseInt(process.env.POWER_THRESHOLD);

    if (totalPower < powerThreshold) {
        throw "'POWER_THRESHOLD' must be less or equal than total power of all 'POWERS'";
    }

    for (const [i, privateKey] of privateKeys.entries()) {
        const account = web3.eth.accounts.privateKeyToAccount(privateKey);

        validators.push({
            power: powers[i],
            account
        });

        web3.eth.accounts.wallet.add(account);
    }

    const checkpoint = makeCheckpoint(web3, validators, 0, peggyId);

    const v = [];
    const r = [];
    const s = [];

    for (let i = 0; i < validators.length; i++) {
        const signature = makeCheckpointSignature(web3, checkpoint, powerThreshold, validators[i]);

        r[i] = signature.r;
        s[i] = signature.s;
        v[i] = signature.v;
    }

    // TODO Add XFI token address.
    await deployer.deploy(
        Peggy,
        peggyId,
        powerThreshold,
        validators.map(v => v.account.address),
        powers,
        v,
        r,
        s,
        process.env.XFI_TOKEN_ADDRESS,
        {from: process.env.CREATOR_ADDRESS}
    );
};
