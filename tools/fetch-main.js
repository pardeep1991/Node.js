var moment = require("moment");
var autoFetch = require("./auto-fetch");
var config = require("../config");

async function latest() {
    try {
        console.log(moment().format("YYYY-MM-DD hh:mm:ss") + "--start fetch latest stock prices...");
        await autoFetch.getLatestPrices();
    } catch (e) {
        console.error(moment().format("YYYY-MM-DD hh:mm:ss"), e)
        return ;
    }
  
}
async function history() {
    console.log(moment().format("YYYY-MM-DD hh:mm:ss") + "--start fetch history prices...");
    try {
        await autoFetch.getHistoryPrices();
        await autoFetch.getCnStockData();
        console.log(moment().format("YYYY-MM-DD hh:mm:ss") + "--start fetch history forex...");
        await autoFetch.getHistoryForex();
    } catch (e) {
        console.error(moment().format("YYYY-MM-DD hh:mm:ss"), e)
        return ;
    }
}
async function main(cmd) {
    await config.connDB();
    if (cmd === "latest" || !cmd) {
        await latest();
    }
    if (cmd === "history") {
        await history();
    }
    config.db.close();
}
const cmd = process.argv[2];
main(cmd);
