import BitShares from "btsdex"
import * as Strategies from "./strategies"
import dotenv from "dotenv"
import { workers, node } from "../config"
import Storage from "./Storage"
import winston, { format } from "winston"

dotenv.config()

BitShares.init(node)
BitShares.subscribe("connected", start)

async function start() {
  let account  = new BitShares(process.env.ACCOUNT_NAME, process.env.ACTIVE_KEY)

  workers.forEach(workerConf => {
    if (workerConf.strategy in Strategies) {
      let storage = new Storage(`storages/${workerConf.strategy}[${workerConf.name}].js`)

      let logger = winston.createLogger({
        format: format.combine(
          format.timestamp(),
          loggerFormats
        ),
        transports: [
          new winston.transports.Console(),
          new winston.transports.File({ filename: `logs/${workerConf.strategy}[${workerConf.name}].log` })
        ]
      });

      let worker = new Strategies[workerConf.strategy](account, storage, workerConf, logger)
      worker.start()
    }
  })
}

const loggerFormats = format.printf(info => {
  return `${info.timestamp} [${info.level}]: ${JSON.stringify(info.message)}`;
});
