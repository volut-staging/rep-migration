const async = require("async");
const constants = require("./constants");

function chunkRepAddresses(allRepAddresses, addressesPerChunk) {
  const numChunks = Math.ceil(allRepAddresses.length / addressesPerChunk);
  const chunkedRepAddresses = new Array(numChunks);
  for (let i = 1; i <= numChunks; ++i) {
    chunkedRepAddresses[i - 1] = allRepAddresses.slice((i - 1) * addressesPerChunk, i * addressesPerChunk);
  }
  return chunkedRepAddresses;
}

function migrateRepChunk(rpc, repAddressChunk, callback) {
  rpc.transact({
    name: "migrateBalances",
    params: repAddressChunk,
    signature: ["address[]"],
    from: rpc.getCoinbase(),
    to: constants.REP_CONTRACT_ADDRESS,
    returns: "null",
    onSent: () => {},
    onSuccess: (res) => {
      console.log("success:", res);
      callback(null);
    },
    onFailed: err => callback(err)
  });
}

function verifySingleAddressRepMigration(rpc, repAddress, callback) {
  const balanceOf = {
    name: "balanceOf",
    params: [repAddress],
    signature: ["address"]
  };
  async.parallel({
    new: (next) => rpc.callContractFunction(Object.assign({}, balanceOf, {
      to: constants.REP_CONTRACT_ADDRESS
    }), newRepBalance => next(null, newRepBalance)),
    old: (next) => rpc.callContractFunction(Object.assign({}, balanceOf, {
      to: constants.LEGACY_REP_CONTRACT_ADDRESS
    }), oldRepBalance => next(null, oldRepBalance))
  }, (_, repBalances) => {
    if (repBalances.old !== repBalances.new) {
      return callback("Inconsistent balances for address " + repAddress + ": " + repBalances.old + " " + repBalances.new);
    }
    callback(null);
  });
}

function verifyRepMigration(rpc, allRepAddresses, callback) {
  console.log("Verifying REP balances match...");
  rpc.callContractFunction({
    name: "totalSupply",
    to: constants.REP_CONTRACT_ADDRESS
  }, (totalSupply) => {
    if (totalSupply !== constants.LEGACY_REP_TOTAL_SUPPLY) {
      return callback("Inconsistent total supply: " + constants.LEGACY_REP_TOTAL_SUPPLY + " " + totalSupply);
    }
    async.eachSeries(allRepAddresses, (repAddress, nextRepAddress) => {
      verifySingleAddressRepMigration(rpc, repAddress, nextRepAddress);
    }, callback);
  });
}

function migrateRep(rpc, allRepAddresses, callback) {
  console.log("Migrating REP...");
  const chunkedRepAddresses = chunkRepAddresses(allRepAddresses, constants.ADDRESSES_PER_CHUNK);
  async.eachLimit(chunkedRepAddresses, constants.PARALLEL_TRANSACTIONS, (repAddressChunk, nextRepAddressChunk) => {
    migrateRepChunk(rpc, repAddressChunk, nextRepAddressChunk);
  }, callback);
}

module.exports.chunkRepAddresses = chunkRepAddresses;
module.exports.migrateRepChunk = migrateRepChunk;
module.exports.migrateRep = migrateRep;