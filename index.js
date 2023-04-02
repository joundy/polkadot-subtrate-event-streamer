const { ApiPromise, WsProvider } = require("@polkadot/api");
const { Abi } = require("@polkadot/api-contract");

// contract address
const contractAddress = "X6e8PEdeZoKo7dyRmqvsURBVVmqYSH5UbzLyZBRCWtv5kGS";
// specify the latest block, the indexer will automaticaly catchup and subsribe the latest block stream
let latestBlockNumber = 3513556;

let subscribeBlockNumber = null;
let isSync = false;

// process the event here..
const decodedEventData = (decodedData) => {
  console.log(decodedData);
  console.log({
    args: JSON.stringify(decodedData.args),
    identifier: decodedData.event.identifier,
  });
};

const getEventByBlockHash = async (api, abi, blockHash) => {
  const signedBlock = await api.rpc.chain.getBlock(blockHash);
  const apiAt = await api.at(signedBlock.block.header.hash);
  const allRecords = await apiAt.query.system.events();

  signedBlock.block.extrinsics.forEach((_, index) => {
    allRecords
      .filter(
        ({ phase }) =>
          phase.isApplyExtrinsic && phase.asApplyExtrinsic.eq(index)
      )
      .forEach((record) => {
        const { event } = record;
        if (event.method === "ContractEmitted" && event.data.length === 2) {
          const bytesData = event.data[1];
          const address = event.data[0].toString();
          if (address === contractAddress) {
            const decodedData = abi.decodeEvent(bytesData);
            decodedEventData(decodedData);
          }
        }
      });
  });
};

const getBlockHashFromBlockNumber = async (api, blockNumber) => {
  const blockHash = await api.rpc.chain.getBlockHash(blockNumber);
  const blockHashStr = blockHash.toString();
  if (
    blockHashStr ===
    "0x0000000000000000000000000000000000000000000000000000000000000000"
  ) {
    return false;
  }
  return blockHashStr;
};

const processByBlock = async (api, abi, blockNumber, blockHash) => {
  console.log(`info.block number: ${blockNumber}, block hash: ${blockHash}`);
  await getEventByBlockHash(api, abi, blockHash);
};

const main = async () => {
  const wsProvider = new WsProvider("wss://shibuya-rpc.dwellir.com/");
  const api = await ApiPromise.create({
    provider: wsProvider,
  });
  console.log("info.api is connected");
  console.log("info.genesis hex: ", api.genesisHash.toHex());

  const abi = new Abi(require("./abi.json"));

  api.rpc.chain.subscribeNewHeads(async (lastHeader) => {
    subscribeBlockNumber = parseInt(lastHeader.number);
    if (isSync) {
      await processByBlock(api, abi, lastHeader.number, lastHeader.hash);
    }
  });

  while (!isSync) {
    let blockHash = await getBlockHashFromBlockNumber(api, latestBlockNumber);
    while (!blockHash) {
      blockHash = await getBlockHashFromBlockNumber(api, latestBlockNumber);
    }
    if (subscribeBlockNumber === latestBlockNumber) {
      isSync = true;
    }

    await processByBlock(api, abi, latestBlockNumber, blockHash);
    if (!isSync) {
      latestBlockNumber += 1;
    }
  }
};

main();
