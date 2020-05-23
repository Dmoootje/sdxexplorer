'use strict'

const Web3Util = require('./helpers/web3')
const publishToQueue = require('./queues')
const db = require('./models')
const events = require('events')
const logger = require('./helpers/logger')

// fix warning max listener
events.EventEmitter.defaultMaxListeners = 1000
process.setMaxListeners(1000)

const sleep = (time) => new Promise((resolve) => setTimeout(resolve, time))

// const countJobs = () => {
//     return new Promise((resolve, reject) => {
//         q.inactiveCount((err, l) => {
//             if (err) {
//                 return reject(err)
//             }
//             return resolve(l)
//         })
//     })
// }

const watch = async () => {
    try {
        const step = 100
        let setting = await db.Setting.findOne({ meta_key: 'min_block_crawl' })
        if (!setting) {
            setting = await new db.Setting({
                meta_key: 'min_block_crawl',
                meta_value: 0
            })
        }
        let minBlockCrawl = parseInt(setting.meta_value || 0)

        while (true) {
            const web3 = await Web3Util.getWeb3()
            // const l = await countJobs()
            // if (l > 500) {
            //     logger.debug('%s jobs, sleep 2 seconds before adding more', l)
            //     await sleep(2000)
            //     continue
            // }

            const maxBlockNum = await web3.eth.getBlockNumber()
            logger.debug('Min block crawl %s, Max block number %s', minBlockCrawl, maxBlockNum)
            if (minBlockCrawl < maxBlockNum) {
                let nextCrawl = minBlockCrawl + step
                nextCrawl = nextCrawl < maxBlockNum ? nextCrawl : maxBlockNum
                for (let i = minBlockCrawl + 1; i <= nextCrawl; i++) {
                    logger.info('BlockProcess %s', i)
                    await publishToQueue('BlockProcess', { block: i })
                    minBlockCrawl = i
                }
            } else {
                logger.debug('There are no new block. Sleep 2 seconds and wait')
                await sleep(2000)
            }

            if (minBlockCrawl > parseInt(setting.meta_value)) {
                setting.meta_value = minBlockCrawl
                await setting.save()
            }
        }
    } catch (e) {
        logger.warn('Sleep 2 seconds before going back to work. Error %s', e)
        await sleep(2000)
        return watch()
    }
}

watch()
