module.exports = {
  norpc: true,
  testCommand: 'npm test',
  compileCommand: 'npm run compile && cp ./test-coverage-environment.config.js ./test-environment.config.js',
  copyPackages: [
    'openzeppelin-eth',
    'openzeppelin-solidity',
    'uFragments',
    'configurable-rights-pool'
  ],
  skipFiles: ['Math.sol'],
};
