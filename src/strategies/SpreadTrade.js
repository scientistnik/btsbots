// calc Price
// get feed
// change parameters

import BitShares from "btsdex"
import BigNumber from "bignumber.js"
import axios from "axios"

class SpreadTrade {
  constructor(account, storage, config, logger) {
    this.name = config.name
    this.account = account
    this.storage = storage
    this.logger = logger

    this.conf = config
    /*
    this.amount = config.amount
    this.buySpread = config.buySpread
    this.sellSpread = config.sellSpread
    this.baseAsset = config.baseAsset
    this.quoteAsset = config.quoteAsset
    this.movePercent = config.movePercent
    this.defaultPrice = config.defaultPrice
    */

    this.queueEvents = Promise.resolve()
    storage.init({
      buy: {
        balance: config.base.balance
      },
      sell: {
        balance: config.quote.balance
      }
    })
  }

  async start() {
    await this.account.initPromise;

    this.base = await BitShares.assets[this.conf.base.asset]
    this.quote = await BitShares.assets[this.conf.quote.asset]

    if ( [this.base.issuer, this.quote.issuer].includes("1.2.0")) {
      if ([this.base.id, this.quote.id].includes("1.3.0"))
        this.getFeed = this.getCoreFeed
      else if (this.base.issuer == this.quote.issuer)
        this.getFeed = this.getSmartFeed
      else this.getFeed = this.getUIAFeed
    } else {
      this.getFeed = this.getUIAFeed
    }

    this.subFunc = this.queue.bind(this)
    BitShares.subscribe("block", this.subFunc)
    this.queue()
  }

  async stop() {
    await this.account.initPromise;

    BitShares.unsubscribe("block", this.subFunc)
  }

  queue() {
    this.queueEvents = this.queueEvents.then(this.checkOrders.bind(this))
                            .catch(this.logger.error.bind(this.logger))
  }

  async checkOrders() {
    let state = this.storage.read()

    let feedPrice = await this.getFeed(),
        buyPrice = feedPrice.div(1 + this.conf.base.spread/100).toNumber(),
        sellPrice = feedPrice.times(1 + this.conf.quote.spread/100).toNumber();

    feedPrice = feedPrice.toNumber()

    if (feedPrice == 0)
      return

    //console.log("feed",feedPrice, buyPrice, sellPrice)

    let buyOrder = state.buy.id ? await this.account.getOrder(state.buy.id) : state.buy.id,
        sellOrder = state.sell.id ? await this.account.getOrder(state.sell.id) : state.sell.id;

    if (buyOrder) { //check Price
      if (BigNumber(Math.abs(buyPrice - state.buy.price))
            .div(state.buy.price)
            .isGreaterThanOrEqualTo(this.conf.movePercent/100)) { // move order

        this.logger.info(`move buy order: ${buyPrice} ${this.quote.symbol}/${this.base.symbol}`)
        await this.account.cancelOrder(state.buy.id)

        // check amount in order
        let orderAmount = BigNumber(buyOrder.for_sale).div(10 ** this.base.precision).toNumber()
        state.buy.balance += orderAmount

        // add to sell balance
        if (state.buy.amount > orderAmount)
          state.sell.balance += BigNumber(state.buy.amount - orderAmount).div(state.buy.price).toNumber()

        let accountBalance = (await this.account.balances(this.base.symbol))[0].amount / 10 ** this.base.precision;
        let amount = Math.min(accountBalance, state.buy.balance, this.conf.base.amount)
        try {
          let obj = await this.account.sell(this.base.symbol, this.quote.symbol, amount, BigNumber(1).div(buyPrice).toNumber())
          state.buy = {
            id: obj ? obj.id : "1.7.0",
            price: buyPrice,
            balance: state.buy.balance - amount,
            amount
          }
        } catch(error) {
          this.logger.error(error)
          state.buy.id = undefined
        }
      }
    } else {
      if (/^1.7.\d*$/.test(state.buy.id)) { // fill order
        state.sell.balance += BigNumber(state.buy.amount).div(state.buy.price).toNumber()
        state.buy.id = undefined
      }

      let accountBalance = BigNumber((await this.account.balances(this.base.symbol))[0].amount)
                .div(10 ** this.base.precision).toNumber();

      if (Math.min(accountBalance, state.buy.balance) >= this.conf.base.amount) { //buy
        this.logger.info(`buy: ${buyPrice} ${this.quote.symbol}/${this.base.symbol}`);
        try {
          let obj = await this.account.sell(
            this.base.symbol,
            this.quote.symbol,
            this.conf.base.amount,
            BigNumber(1).div(buyPrice).toNumber()
          )
          state.buy = {
            id: obj ? obj.id : "1.7.0",
            price: buyPrice,
            balance: state.buy.balance - this.conf.base.amount,
            amount: this.conf.base.amount
          }
        } catch(error) {
          this.logger.error(error)
        }
      }
    }

    if (sellOrder) { //check Price
      if (BigNumber(Math.abs(sellPrice - state.sell.price))
            .div(state.sell.price)
            .isGreaterThanOrEqualTo(this.conf.movePercent/100)) { // move order

        this.logger.info(`move sell order: ${sellPrice} ${this.quote.symbol}/${this.base.symbol}`)
        await this.account.cancelOrder(state.sell.id)

        // check amount in order
        let orderAmount = BigNumber(sellOrder.for_sale).div(10 ** this.quote.precision).toNumber()
        state.sell.balance += orderAmount

        // add to buy balance
        if (state.sell.amount > orderAmount)
          state.buy.balance += BigNumber(state.sell.amount - orderAmount).times(state.sell.price).toNumber()

        let accountBalance = BigNumber((await this.account.balances(this.quote.symbol))[0].amount)
                .div(10 ** this.quote.precision).toNumber();
        let amount = Math.min(accountBalance, state.sell.balance, this.conf.quote.amount)
        try {
          let obj = await this.account.sell(this.quote.symbol, this.base.symbol, amount, sellPrice)
          state.sell = {
            id: obj ? obj.id : "1.7.0",
            price: sellPrice,
            balance: state.sell.balance - amount,
            amount
          }
        } catch(error) {
          this.logger.error(error)
          state.sell.id = undefined
        }
      }
    } else {
      if (/^1.7.\d*$/.test(state.sell.id)) { // fill order
        state.buy.balance += BigNumber(state.sell.amount).times(state.sell.price).toNumber()
        state.sell.id = undefined
      }

      let accountBalance = BigNumber((await this.account.balances(this.quote.symbol))[0].amount)
            .div(10 ** this.quote.precision).toNumber();

      if (Math.min(accountBalance, state.sell.balance) >= this.conf.quote.amount) { //buy
        this.logger.info(`sell: ${sellPrice} ${this.quote.symbol}/${this.base.symbol}`);
        try {
          let obj = await this.account.sell(
            this.quote.symbol,
            this.base.symbol,
            this.conf.quote.amount,
            sellPrice
          )
          state.sell = {
            id: obj ? obj.id : "1.7.0",
            price: sellPrice,
            balance: state.sell.balance - this.conf.quote.amount,
            amount: this.conf.quote.amount
          }
        } catch(error) {
          this.logger.error(error)
        }
      }
    }


    this.storage.write(state)
  }

  async getCoreFeed() {
    let rate

    if (this.base.id == "1.3.0") {
      await this.quote.update()
      rate = this.quote.options.core_exchange_rate
    } else {
      await this.base.update()
      rate = this.base.options.core_exchange_rate
    }

    let [base, quote] = rate.base.asset_id == this.base.id ? [rate.base, rate.quote] : [rate.quote, rate.base]

    return BigNumber(base.amount).div(10 ** this.base.precision)
            .div(BigNumber(quote.amount).div(10 ** this.quote.precision))
  }

  async getSmartFeed() {
    let bts = await BitShares.assets["bts"]
    await this.base.update()
    let rate = this.base.options.core_exchange_rate
    let [base, quote] = rate.base.asset_id == "1.3.0" ? [rate.base, rate.quote] : [rate.quote, rate.base]

    let basePrice =  BigNumber(base.amount).div(10 ** bts.precision)
            .div(BigNumber(quote.amount).div(10 ** this.base.precision))

    await this.quote.update()
    rate = this.quote.options.core_exchange_rate
    if (rate.base.asset_id == "1.3.0") {
      base = rate.base
      quote = rate.quote
    } else {
      base = rate.quote
      quote = rate.base
    }

    let quotePrice = BigNumber(base.amount).div(10 ** bts.precision)
            .div(BigNumber(quote.amount).div(10 ** this.quote.precision))

    return quotePrice.div(basePrice)
  }

  async getUIAFeed() {
    return this.conf.defaultPrice ? BigNumber(this.conf.defaultPrice) :
            await this.binancePrice(this.base.symbol, this.quote.symbol)
    //return BigNumber(this.conf.defaultPrice++)
  }

  async binancePrice(base, quote) {
    let asset = `${quote.split(".").slice(-1)[0]}${base.split(".").slice(-1)[0]}`
                  .toUpperCase().replace("USD","USDT")
    console.log(`get asset: ${asset}`)
    this.priceArray = this.priceArray || []

    try {
      let data = await axios.get("https://api.binance.com/api/v1/trades",{params: {symbol: asset, limit: 1}})
      this.priceArray.push(data.data[0].price)
    } catch(error) {
      this.logger.error(`Error Binance request: ${asset}, error: ${error}`)
    }

    if (this.priceArray.length > 10)
      this.priceArray.shift()

    return this.priceArray.length > 0 ? this.priceArray.reduce(
      (a, b) => a.plus(b), BigNumber(0)
    ).div(this.priceArray.length) : BigNumber(0)
  }
}

export default SpreadTrade
