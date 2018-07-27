module.exports = {
  //node: "wss://node.testnet.bitshares.eu",
  node: "wss://bitshares.openledger.info/ws",
  workers: [
    {
      name: "RubleWorker",
      strategy: "SpreadTrade",
      base: {
        asset: "bts",
        balance: 2,
        amount: 1,
        spread: 2,
      },
      quote: {
        asset: "ruble",
        balance: 1,
        amount: 1,
        spread: 2
      },
      movePercent: 2,
      defaultPrice: 10
    }
  ]
}
