/*
  Config for worker:
  {
    name: "Worker2",
    strategy: "MiddleOrders",
    baseAsset: "TEST",
    quoteAsset: "BESTUSD",
    spread: 2,
    amount: 1,
    balance: 0
  }
*/

import BitShares from "btsdex"
import BigNumber from "bignumber.js"

class MiddleOrders {
  constructor(account, storage, config, logger) {
    this.name = config.name
    this.account = account
    this.storage = storage

    this.spread = config.spread
    this.amount = config.amount
    this.quoteAsset = config.quoteAsset
    this.baseAsset = config.baseAsset

    this.queueEvents = Promise.resolve()
    storage.init({ balance: config.balance, orders: [] })

    this.logger = logger
  }

  async start() {
    await this.account.initPromise;

    this.subFunc = this.queue.bind(this)
    BitShares.subscribe("account", this.subFunc, this.account.account.name)
    this.queue()
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
    let state = this.storage.read()

    let orders = (await this.account.orders()).map(order => order.id);

    let processOrders = []
    state.orders.forEach(order => {
      if (!orders.includes(order.id)) {
        processOrders.push(order);
      }
    })

    for(let i = 0; i < processOrders.length; i++) {
      let order = processOrders[i];

      let index = state.orders.indexOf(order)

      if (order.sell || order.id == null) {
        if (index !== -1) state.orders.splice(index,1);
        state.balance += this.amount;
      } else {
        order.sell = BigNumber(order.buy).times(this.spread / 100).plus(order.buy).toNumber()

        this.logger.info(`sell: ${order.sell} ${this.quoteAsset}/${this.baseAsset}`)
        let obj = await this.account.sell(this.quoteAsset, this.baseAsset, order.amount, order.sell)
        state.orders[index].id = obj ? obj.id : null
      }
    }

    if (state.balance > this.amount) {
      let ticker = await BitShares.ticker(this.quoteAsset, this.baseAsset);
      let middle = BigNumber(ticker.lowest_ask).plus(ticker.highest_bid).div(2).toNumber()

      let obj = await this.account.sell(this.baseAsset, this.quoteAsset, this.amount, middle)

      let order = {
        buy: 1 / middle,
        amount: BigNumber(this.amount).times(middle).toNumber(),
        id: obj ? obj.id : "1.7.0"
      }
      state.orders.push(order)
      state.balance -= this.amount;
      this.logger.info(`buy: ${order.buy} ${this.quoteAsset}/${this.baseAsset}`)
    }

    this.storage.write(state)
  }
}

export default MiddleOrders
