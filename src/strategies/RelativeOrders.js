/*
  Config for worker:
  {
    name: "Worker1",            // worker name
    strategy: "RelativeOrders", // Stategy name
    baseAsset: "TEST",          //
    quoteAsset: "BESTUSD",
    basePrice: 62,
    spread: 2,
    amount: 1,
    balanceBase: 5,
    balanceQuote: 5
  }
*/

import BitShares from "btsdex"
import BigNumber from "bignumber.js"

class RelativeOrders {
  constructor(account, storage, config, logger) {
    this.name = config.name
    this.account = account
    this.storage = storage

    this.basePrice = config.basePrice
    this.spread = config.spread
    this.amount = config.amount
    this.quoteAsset = config.quoteAsset
    this.baseAsset = config.baseAsset

    this.queueEvents = Promise.resolve()
    storage.init({
      balance: {
        base: config.balanceBase,
        quote: config.balanceQuote
      },
      orders: []
    })

    this.logger = logger
  }

  async start() {
    await this.account.initPromise;

    // Init state
    let state = this.storage.read()

    if (state.orders.length == 0) {
      let price = BigNumber(this.basePrice);

      for (; state.balance.quote > 0; state.balance.quote--) {
        price = price.times(1 + this.spread/100)
        state.orders.push({
          sell: price.toNumber(),
          buy: price.div(1 + this.spread/100).toNumber(),
          state: 'sell',
          amount: this.amount
        })
        this.queue()
      }

      price = BigNumber(Bthis.basePrice);
      for (; state.balance.base > 0; state.balance.base--) {
        price = price.div(1 + this.spread/100)
        state.orders.push({
          sell: price.times(1 + this.spread/100).toNumber(),
          buy: price.toNumber(),
          state: 'buy',
          amount: this.amount
        })
        this.queue()
      }
    } else {
      this.queue()
    }

    this.storage.write(state)

    this.subFunc = this.queue.bind(this)
    BitShares.subscribe("account", this.subFunc, this.account.account.name)
  }

  async stop() {
    await this.account.initPromise;

    BitShares.unsubscribe("account", this.subFunc, this.account.account.name)
  }

  queue() {
    this.queueEvents = this.queueEvents.then(this.checkOrders.bind(this))
                            .catch(this.logger.error.bind(this.logger))
  }

  async checkOrders() {
    let state = this.storage.read();

    let ids = (await this.account.orders()).map(order => order.id);
    let order = state.orders.find(order => (!order.id || !ids.includes(order.id) ));

    if (!order)
      return

    if (!order.id) { // first orders set
      if (order.state == "sell") {
        this.logger.info(`sell: ${order.sell} ${this.quoteAsset}/${this.baseAsset}`);
        let obj = await this.account.buy(this.baseAsset, this.quoteAsset, order.amount, BigNumber(1).div(order.sell).toNumber());
        this.logger.info("after")
        order.id = obj ? obj.id : "1.7.0";
      } else {
        this.logger.info(`buy: ${order.buy} ${this.quoteAsset}/${this.baseAsset}`);
        let obj = await this.account.sell(this.baseAsset, this.quoteAsset, order.amount, BigNumber(1).div(order.buy).toNumber());
        order.id = obj ? obj.id : "1.7.0";
      }
    } else {
      if (order.state == "sell") { // did sell
        this.logger.info(`buy: ${order.buy} ${this.quoteAsset}/${this.baseAsset}`);
        let obj = await this.account.sell(this.baseAsset, this.quoteAsset, order.amount, BigNumber(1).div(order.buy).toNumber());
        order.id = obj ? obj.id : "1.7.0";
        order.state = "buy";
      } else { // did buy
        this.logger.info(`sell: ${order.sell} ${this.quoteAsset}/${this.baseAsset}`);
        let obj = await this.account.buy(this.baseAsset, this.quoteAsset, order.amount, BigNumber(1).div(order.sell).toNumber());
        order.id = obj ? obj.id : "1.7.0";
        order.state = "sell";
      }
    }

    this.storage.write(state)
  }
}

export default RelativeOrders
