'use strict';

const { toWei } = require("../lib/helpers");
const cosmos = require('cosmos-lib');
const web3 = new Web3(WEB3_PROVIDER_URL);
const crypto = require('crypto');

const VALIDATORS_N = 10;

const CHECKPOINT_METHOD = Buffer.from(web3.utils.keccak256('checkpoint').slice(2), 'hex');
const WITHDRAW_METHOD = Buffer.from(web3.utils.keccak256('withdraw').slice(2), 'hex')

// Gas - deposit ~ 40-60k.
// Gas - withdraw - ~ 200k (10 validators).

describe('Peggy', () => {
    const MNEMONIC = 'cluster unveil differ bright define prosper hunt warrior fetch rough host fringe worry mention gospel enlist elder laugh segment funny avoid regular market fortune';
    const keys = cosmos.crypto.getKeysFromMnemonic(MNEMONIC);
    const prefix = 'wallet';
    const address = cosmos.address.getAddress(keys.publicKey, prefix); // prefix by default is 'cosmos'.
    const comsosBytes32 = cosmos.address.getBytes32(address);

    const peggyId = Buffer.from(web3.utils.keccak256("dfinance_peggy"), 'hex');

    const powerThreshold = '5000000';
    const creator       = web3.eth.accounts.create();
    const xfiOwner      = web3.eth.accounts.create();
    const recipient     = web3.eth.accounts.create();
    
    const validators    = [];
    for (let i = 0; i < VALIDATORS_N; i++) {
        validators[i] = {
            account: web3.eth.accounts.create(),
            power: 1000000,
        }
    }

    const accounts = [{
        balance: toWei('100'),
        secretKey: creator.privateKey
    }, {
        balance: toWei('100'),
        secretKey: xfiOwner.privateKey
    }, {
        balance: toWei('100'),
        secretKey: recipient.privateKey
    }].concat(validators.map(v => {
        return {
            balance: toWei('100'),
            secretKey: v.account.privateKey,
        }
    }))

    const testRpc = TestRpc({
        accounts,
        locked: false
    });


    let peggy;
    let xfi;

    before('launch the Test RPC', async () => {
        await testRpc.start(TEST_RPC_PORT);
    });

    before('deploy', async () => {
        // Deploy XFI.
        const checkpoint = makeCheckpoint(validators, 0, peggyId);

        const web3Provider = new Web3.providers.HttpProvider(WEB3_PROVIDER_URL);

        const PeggyJson = require('build/contracts/Peggy.json')
        const Peggy = contract({abi: PeggyJson.abi, unlinked_binary: PeggyJson.bytecode});
        Peggy.setProvider(web3Provider);

        const valAddresses = validators.map(v => v.account.address);
        const valPowers = validators.map(v => v.power.toString());

        const v = [];
        const r = [];
        const s = [];

        for (let i = 0; i < validators.length; i++) {
            let signature = makeCheckpointSignature(checkpoint, powerThreshold, validators[i]);
            r[i] = signature.r;
            s[i] = signature.s;
            v[i] = signature.v;
        }

        peggy = await Peggy.new(peggyId, powerThreshold, valAddresses, valPowers, v, r, s, {from: creator.address});

        const lastCheckpoint = await peggy.lastCheckpoint.call();
        lastCheckpoint.should.be.equal(checkpoint);

        // Deploy XFI token.
        const XfiJson = require('build/contracts/XFIToken.json')
        const Xfi = contract({abi: XfiJson.abi, unlinked_binary: XfiJson.bytecode});
        Xfi.setProvider(web3Provider);

        xfi = await Xfi.new({from: xfiOwner.address});
    });

    // Let's deposit XFI
    it('deposit XFI', async () => {
        const toDeposit = toWei('1000');

        const peggyBalanceBefore = await xfi.balanceOf(peggy.address);
        peggyBalanceBefore.toString().should.be.equal('0');

        await xfi.approve(peggy.address, toWei('1000'), {from: xfiOwner.address});
        const {receipt} = await peggy.deposit(xfi.address, comsosBytes32, toDeposit, {from: xfiOwner.address});

        const depositEvent = receipt.logs[0];
        depositEvent.event.should.be.equal('Deposit');
        depositEvent.args._erc20.should.be.equal(xfi.address);
        depositEvent.args._destination.should.be.equal('0x' + comsosBytes32.toString('hex'))
        depositEvent.args._amount.toString().should.be.equal(toDeposit);
        
        const peggyBalanceAfter = await xfi.balanceOf(peggy.address);
        peggyBalanceAfter.toString().should.be.equal(toDeposit);
    });

    // Withdraw XFI from PegZone by validators confirmations.
    it('withdraw XFI', async () => {
        const toWithdraw = toWei('100');

        const peggyBalanceBefore = await xfi.balanceOf(peggy.address);
        peggyBalanceBefore.toString().should.be.equal(toWei('1000'));

        const recipientBalanceBefore = await xfi.balanceOf(recipient.address);
        recipientBalanceBefore.toString().should.be.equal('0');

        const txId = web3.utils.keccak256('tx1');

        const valAddresses = validators.map(v => v.account.address);
        const valPowers = validators.map(v => v.power.toString());

        const v = [];
        const r = [];
        const s = [];

        for (let i = 0; i < validators.length; i++) {
            let signature = makeWithdrawSignature(txId, toWithdraw, recipient.address, peggyId, validators[i]);
            r[i] = signature.r;
            s[i] = signature.s;
            v[i] = signature.v;
        }

        const {receipt} = await peggy.withdraw(txId, xfi.address, recipient.address, toWithdraw, valAddresses, 0, valPowers, v, r, s, {from: recipient.address });

        const peggyBalanceAfter = await xfi.balanceOf(peggy.address);
        peggyBalanceAfter.toString().should.be.equal(toWei('900'));

        const recipientBalanceAfter = await xfi.balanceOf(recipient.address);
        recipientBalanceAfter.toString().should.be.equal(toWei('100'));

        const withdrawEvent = receipt.logs[0];
        withdrawEvent.event.should.be.equal('Withdraw');
        withdrawEvent.args._erc20.should.be.equal(xfi.address);
        withdrawEvent.args._destination.should.be.equal(recipient.address);
        withdrawEvent.args._amount.toString().should.be.equal(toWithdraw);
    });

    // withdraw without enough voting power.
    it('withdraw XFI (without enough voting power)', async () => {
        const toWithdraw = toWei('100');
        const txId = web3.utils.keccak256('tx2');

        const valAddresses = validators.map(v => v.account.address);
        const valPowers = validators.map(v => v.power.toString());

        const v = [];
        const r = [];
        const s = [];

        for (let i = 0; i < 1; i++) {
            let signature = makeWithdrawSignature(txId, toWithdraw, recipient.address, peggyId, validators[i]);
            r[i] = signature.r;
            s[i] = signature.s;
            v[i] = signature.v;
        }

        for (let i = 1; i < validators.length; i++) {
            r[i] = crypto.randomBytes(32);
            s[i] = crypto.randomBytes(32);
            v[i] = 0;
        }
        
        try {
            await peggy.withdraw(txId, xfi.address, recipient.address, toWithdraw, valAddresses, 0, valPowers, v, r, s, {from: recipient.address });
            throw Error('should revert')
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('Peggy: submitted validator set signatures do not have enough power');
        }
    });


    // withdraw already processed id.
    it('withdraw XFI (already processed id)', async () => {
        const toWithdraw = toWei('100');
        const txId = web3.utils.keccak256('tx1');

        const valAddresses = validators.map(v => v.account.address);
        const valPowers = validators.map(v => v.power.toString());

        const v = [];
        const r = [];
        const s = [];

        for (let i = 0; i < validators.length; i++) {
            let signature = makeWithdrawSignature(txId, toWithdraw, recipient.address, peggyId, validators[i]);
            r[i] = signature.r;
            s[i] = signature.s;
            v[i] = signature.v;
        }

        try {
            await peggy.withdraw(txId, xfi.address, recipient.address, toWithdraw, valAddresses, 0, valPowers, v, r, s, {from: recipient.address });
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('Peggy: transaction id already processed');
        }
    });

    it('withdraw XFI (fake validators)', async () => {
        const toWithdraw = toWei('100');
        const txId = web3.utils.keccak256('tx3');

        const fakeValidators = [];
        for (let i = 0; i < 5; i++) {
            fakeValidators[i] = {
                account: web3.eth.accounts.create(),
                power: 1000000,
            }
        }  

        const valAddresses = fakeValidators.map(v => v.account.address);
        const valPowers = fakeValidators.map(v => v.power.toString());

        const v = [];
        const r = [];
        const s = [];

        for (let i = 0; i < fakeValidators.length; i++) {
            let signature = makeWithdrawSignature(txId, toWithdraw, recipient.address, peggyId, fakeValidators[i]);
            r[i] = signature.r;
            s[i] = signature.s;
            v[i] = signature.v;
        }

        try {
            await peggy.withdraw(txId, xfi.address, recipient.address, toWithdraw, valAddresses, 0, valPowers, v, r, s, {from: recipient.address });
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('Peggy: supplied current validators and powers do not match checkpoint');
        }
    });

    

    // update validators list.
    // try to withdraw with old validators list.

    after('stop the Test RPC', () => {
        testRpc.stop();
    });
});

function makeWithdrawSignature(id, amount, destination, peggyId, validator) {
   const toSign = web3.utils.keccak256(web3.eth.abi.encodeParameters(
       ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
       [peggyId, WITHDRAW_METHOD, id, amount, destination]
   ));
   
   return web3.eth.accounts.sign(toSign, validator.account.privateKey);
}

function makeCheckpointSignature(checkpoint, powerThreshold, validator) {
    const toSign = web3.utils.keccak256(web3.eth.abi.encodeParameters(['bytes32', 'uint256'], [checkpoint, powerThreshold]));
    return web3.eth.accounts.sign(toSign, validator.account.privateKey);
}

function makeCheckpoint(validators, nonce, peggyId) {
    const valAddresses = validators.map(v => v.account.address);
    const valPowers = validators.map(v => v.power.toString());

    return web3.utils.keccak256(web3.eth.abi.encodeParameters(
        ['bytes32', 'bytes32', 'uint256', 'address[]', 'uint256[]'], 
        [peggyId, CHECKPOINT_METHOD, nonce, valAddresses, valPowers]
    ))
}
