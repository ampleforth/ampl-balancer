const { expect } = require('chai');
const { expectEvent } = require('@openzeppelin/test-helpers');
const { contract, web3 } = require('@openzeppelin/test-environment');

const OrchestratorAmplElasticCRPCaller = contract.fromArtifact('OrchestratorAmplElasticCRPCaller');
const MockCRPPool = contract.fromArtifact('MockCRPPool');
const MockCRPPoolRevertWithString = contract.fromArtifact('MockCRPPoolRevertWithString');
const MockCRPPoolRevert = contract.fromArtifact('MockCRPPoolRevert');

const TOKEN_ADDRESS = '0x0aeeE23D16084d763e7a65577020C1f3d18804F2';

describe('OrchestratorAmplElasticCRPCaller', function () {
  describe('successful resync', function () {
    it('should call resync and return', async function () {
      const mockPool = await MockCRPPool.new();
      const caller = await OrchestratorAmplElasticCRPCaller.new();
      const tx = await caller.safeResync(mockPool.address, mockPool.address, TOKEN_ADDRESS);

      const resyncLogAbi = mockPool.abi.filter(e => e.name === 'Resync')[0];
      const resyncLogRaw = tx.receipt.rawLogs[0];
      const resyncLog = web3.eth.abi.decodeLog(resyncLogAbi.inputs, resyncLogRaw.data, resyncLogRaw.topics);
      expect(resyncLog.token).to.eq(TOKEN_ADDRESS);
    });
  });

  describe('revert resync with reason', function () {
    it('should call gulp and log error', async function () {
      const mockPool = await MockCRPPoolRevertWithString.new();
      const caller = await OrchestratorAmplElasticCRPCaller.new();
      const tx = await caller.safeResync(mockPool.address, mockPool.address, TOKEN_ADDRESS);

      const gulpLogAbi = mockPool.abi.filter(e => e.name === 'Gulp')[0];
      const gulpLogRaw = tx.receipt.rawLogs[0];
      const gulpLog = web3.eth.abi.decodeLog(gulpLogAbi.inputs, gulpLogRaw.data, gulpLogRaw.topics);
      expect(gulpLog.token).to.eq(TOKEN_ADDRESS);

      expectEvent(tx, 'LogErrorReason', {
        reason: 'FAILED'
      });
    });
  });

  describe('revert resync without reason', function () {
    it('should call gulp and log error', async function () {
      const mockPool = await MockCRPPoolRevert.new();
      const caller = await OrchestratorAmplElasticCRPCaller.new();
      const tx = await caller.safeResync(mockPool.address, mockPool.address, TOKEN_ADDRESS);

      const gulpLogAbi = mockPool.abi.filter(e => e.name === 'Gulp')[0];
      const gulpLogRaw = tx.receipt.rawLogs[0];
      const gulpLog = web3.eth.abi.decodeLog(gulpLogAbi.inputs, gulpLogRaw.data, gulpLogRaw.topics);
      expect(gulpLog.token).to.eq(TOKEN_ADDRESS);

      expectEvent(tx, 'LogErrorReason', {
        reason: ''
      });
    });
  });
});
