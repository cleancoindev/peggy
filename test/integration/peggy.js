'use strict';

const { toWei, toStr } = require("../lib/helpers");
const cosmos = require('cosmos-lib');
const web3 = new Web3(WEB3_PROVIDER_URL);
const crypto = require('crypto');
const { makeWithdrawSignature, makeCheckpointSignature, makeCheckpoint } = require('../lib/signatures');

const VALIDATORS_N = 10;

// Gas - deposit ~ 40-60k.
// Gas - withdraw - ~ 200k (10 validators).

describe('Peggy', () => {
    const MNEMONIC = 'cluster unveil differ bright define prosper hunt warrior fetch rough host fringe worry mention gospel enlist elder laugh segment funny avoid regular market fortune';
    const keys = cosmos.crypto.getKeysFromMnemonic(MNEMONIC);
    const prefix = 'wallet';
    const address = cosmos.address.getAddress(keys.publicKey, prefix); // prefix by default is 'cosmos'.
    const comsosBytes32 = cosmos.address.getBytes32(address);

    const peggyId = Buffer.from(web3.utils.keccak256("dfinance_peggy").slice(2), 'hex');

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

    const replacedValidators = [];
    for (let i = 0; i < VALIDATORS_N; i++) {
        replacedValidators[i] = {
            account: web3.eth.accounts.create(),
            power: 750000,
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
    })).concat(replacedValidators.map(v => {
        return {
            balance: toWei('100'),
            secretKey: v.account.privateKey,
        }
    }));

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
        const checkpoint = makeCheckpoint(web3, validators, 0, peggyId);

        const web3Provider = new Web3.providers.HttpProvider(WEB3_PROVIDER_URL);

        const PeggyJson = require('build/contracts/Peggy.json')
        const Peggy = contract({abi: PeggyJson.abi, unlinked_binary: PeggyJson.bytecode});
        Peggy.setProvider(web3Provider);

        const valAddresses = validators.map(v => v.account.address);
        const valPowers = validators.map(v => toStr(v.power));

        const v = [];
        const r = [];
        const s = [];

        for (let i = 0; i < validators.length; i++) {
            let signature = makeCheckpointSignature(web3, checkpoint, powerThreshold, validators[i]);
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
        toStr(peggyBalanceBefore).should.be.equal('0');

        await xfi.approve(peggy.address, toWei('1000'), {from: xfiOwner.address});
        const {receipt} = await peggy.deposit(xfi.address, comsosBytes32, toDeposit, {from: xfiOwner.address});

        const depositEvent = receipt.logs[0];
        depositEvent.event.should.be.equal('Deposit');
        depositEvent.args._erc20.should.be.equal(xfi.address);
        depositEvent.args._destination.should.be.equal('0x' + comsosBytes32.toString('hex'))
        toStr(depositEvent.args._amount).should.be.equal(toDeposit);
        
        const peggyBalanceAfter = await xfi.balanceOf(peggy.address);
        toStr(peggyBalanceAfter).should.be.equal(toDeposit);
    });

    // Withdraw XFI from PegZone by validators confirmations.
    it('withdraw XFI', async () => {
        const toWithdraw = toWei('100');

        const peggyBalanceBefore = await xfi.balanceOf(peggy.address);
        toStr(peggyBalanceBefore).should.be.equal(toWei('1000'));

        const recipientBalanceBefore = await xfi.balanceOf(recipient.address);
        toStr(recipientBalanceBefore).should.be.equal('0');

        const txId = web3.utils.keccak256('tx1');

        const valAddresses = validators.map(v => v.account.address);
        const valPowers = validators.map(v => toStr(v.power));

        const v = [];
        const r = [];
        const s = [];

        for (let i = 0; i < validators.length; i++) {
            let signature = makeWithdrawSignature(web3, txId, toWithdraw, recipient.address, peggyId, validators[i]);
            r[i] = signature.r;
            s[i] = signature.s;
            v[i] = signature.v;
        }

        const {receipt} = await peggy.withdraw(txId, xfi.address, recipient.address, toWithdraw, valAddresses, 0, valPowers, v, r, s, {from: recipient.address });

        const peggyBalanceAfter = await xfi.balanceOf(peggy.address);
        toStr(peggyBalanceAfter).should.be.equal(toWei('900'));

        const recipientBalanceAfter = await xfi.balanceOf(recipient.address);
        toStr(recipientBalanceAfter).should.be.equal(toWei('100'));

        const withdrawEvent = receipt.logs[0];
        withdrawEvent.event.should.be.equal('Withdraw');
        withdrawEvent.args._erc20.should.be.equal(xfi.address);
        withdrawEvent.args._destination.should.be.equal(recipient.address);
        toStr(withdrawEvent.args._amount).should.be.equal(toWithdraw);
    });

    // withdraw without enough voting power.
    it('withdraw XFI (without enough voting power)', async () => {
        const toWithdraw = toWei('100');
        const txId = web3.utils.keccak256('tx2');

        const valAddresses = validators.map(v => v.account.address);
        const valPowers = validators.map(v => toStr(v.power));

        const v = [];
        const r = [];
        const s = [];

        for (let i = 0; i < 1; i++) {
            let signature = makeWithdrawSignature(web3, txId, toWithdraw, recipient.address, peggyId, validators[i]);
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
        const valPowers = validators.map(v => toStr(v.power));

        const v = [];
        const r = [];
        const s = [];

        for (let i = 0; i < validators.length; i++) {
            let signature = makeWithdrawSignature(web3, txId, toWithdraw, recipient.address, peggyId, validators[i]);
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
        const valPowers = fakeValidators.map(v => toStr(v.power));

        const v = [];
        const r = [];
        const s = [];

        for (let i = 0; i < fakeValidators.length; i++) {
            let signature = makeWithdrawSignature(web3, txId, toWithdraw, recipient.address, peggyId, fakeValidators[i]);
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
    it('update validators list power', async () => {
        const currentPowers = validators.map(v => toStr(v.power));;

        for (let i = 0; i < validators.length; i++) {
            validators[i].power = 750000;
        }

        const checkpoint = makeCheckpoint(web3, validators, 1, peggyId);

        const valAddresses = validators.map(v => v.account.address);
        const valPowers = validators.map(v => toStr(v.power));

        const v = [];
        const r = [];
        const s = [];

        for (let i = 0; i < validators.length; i++) {
            let signature = web3.eth.accounts.sign(checkpoint, validators[i].account.privateKey);
            r[i] = signature.r;
            s[i] = signature.s;
            v[i] = signature.v;
        }

        const {receipt} = await peggy.updateValset(valAddresses, valPowers, 1, valAddresses, currentPowers, 0, v, r, s, {from: creator.address});
        const updateEvent = receipt.logs[0];
        updateEvent.event.should.be.equal('ValsetUpdated');
        for (let i = 0; i < updateEvent.args._validators; i++) {
            updateEvent.args._validators[i].should.be.equal(valAddresses[i]);
            toStr(updateEvent.args._powers[i]).should.be.equal(currentPowers[i]);
        }

        const newCheckpoint = await peggy.lastCheckpoint.call();
        newCheckpoint.should.be.equal(checkpoint);
    });

    // replace validators list.
    it('replace validators list', async () => {
        const checkpoint = makeCheckpoint(web3, replacedValidators, 2, peggyId);

        const valAddresses = validators.map(v => v.account.address);
        const valPowers = validators.map(v => toStr(v.power));

        const newValAddresses = replacedValidators.map(v => v.account.address);
        const newValPowers = replacedValidators.map(v => toStr(v.power));

        const v = [];
        const r = [];
        const s = [];

        // old validators sign new validator set.
        for (let i = 0; i < validators.length; i++) {
            let signature = web3.eth.accounts.sign(checkpoint, validators[i].account.privateKey);
            r[i] = signature.r;
            s[i] = signature.s;
            v[i] = signature.v;
        }

        await peggy.updateValset(newValAddresses, newValPowers, 2, valAddresses, valPowers, 1, v, r, s, {from: creator.address})
    });

    // try to withdraw with old validators list.
    it('withdraw with old validators list', async () => {
        const toWithdraw = toWei('100');
        const txId = web3.utils.keccak256('tx3');

        const valAddresses = validators.map(v => v.account.address);
        const valPowers = validators.map(v => toStr(v.power));

        const v = [];
        const r = [];
        const s = [];

        for (let i = 0; i < validators.length; i++) {
            let signature = makeWithdrawSignature(web3, txId, toWithdraw, recipient.address, peggyId, validators[i]);
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

    after('stop the Test RPC', () => {
        testRpc.stop();
    });
});

