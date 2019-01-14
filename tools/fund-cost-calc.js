const moment = require("moment");
// const mongo = require("./mongoConn");
var config = require("../config");

exports.fundCalc = async function() {
    // const db = await mongo.connDB();
    let shareStats = await config.db.collection('dealRecords').aggregate([
      {
        $group : {
           _id : "$shareId",
           totalAmount: { $sum: "$amount" },
           totalCost: { $sum: { $add:[{$multiply: [ "$amount", "$price" ]},"$fee"] } },
        }
      }
    ]).toArray();

    const shareStatMap = {};
    await shareStats.forEach(ss => {
        shareStatMap[ss._id] = ss;
    });
    let fundsDB = db.collection('funds');
    let funds = await fundsDB.aggregate([
        {$lookup: {
            from: "shares",
            localField: "_id",
            foreignField: "fundId",
            as: "shares"
        }}
    ]).toArray();

    const currencyConvertMap = {};
    const currencyConvertList = await config.db.collection("currencies").find().toArray();
    currencyConvertList.forEach(cc=>{
        currencyConvertMap[cc.dest] = { "USD": cc.USD, "HKD": cc.HKD, "CNY": cc.CNY, "fetchTime": cc.refreshTime };
    });
    const performances = funds.map(f => {
        let fs = { fundId: f._id, currency: f.currency, name: f.name, shares: [], dealRecords: f.dealRecords };
        if(fs.dealRecords){
            fs.allCost = f.dealRecords.reduce((allCost, dr) => allCost + dr.spent, 0);    
        } else {
            fs.allCost = 0;
        }
        fs.totalShareCap = 0;
        fs.totalShareCost = 0;

        f.shares.forEach(share => {
            const stat = shareStatMap[share._id];
            share.amount = 0;
            share.cost = 0;
            const destCurrency = f.currency;
            const forex = currencyConvertMap[destCurrency][share.currency];
            if(stat) {
                share.amount = stat.totalAmount;
                share.cost = stat.totalCost;
                fs.totalShareCost += stat.totalCost * forex;
                fs.totalShareCap += stat.totalAmount * share.latestPrice * forex;
            }
            fs.shares.push(share);
        });
        fs.trackDate = moment().format("YYYY-MM-DD");
        return fs;
    });
    // db.close();
    return performances;
}

exports.fundHistoryTrack = async function(date, autoSave = true) {
    // const db = await mongo.connDB();
    const codes = await config.db.collection("shares").aggregate([{$group:{_id:"$code"}}]).toArray();
    const priceMap = {};
    for(let i in codes) {
        const code = codes[i]._id;
        const prices = await config.db.collection("priceHistories").find({date: {$lte: date},code: code}).sort({date:-1}).limit(1).toArray();
        if(prices[0]) priceMap[code] = prices[0].close;
        // else
        //     console.log(prices);
    }
    const forexes = await config.db.collection("currencies").find({date: {$lte:date}}).toArray();
    let shareStats = await config.db.collection('dealRecords').aggregate([
        { $match: { dealedAt: { $lte: date } } }, // dealed date <= track date
        {
            $group : {
            _id : "$shareId",
            totalAmount: { $sum: "$amount" },
            totalCost: { $sum: { $add:[{$multiply: [ "$amount", "$price" ]},"$fee"] } },
            }
        }
    ]).toArray();

    const shareStatMap = {};
    await shareStats.forEach(ss => {
        shareStatMap[ss._id] = ss;
    });
    let funds = await config.db.collection('funds').aggregate([
        {$lookup: {
            from: "shares",
            localField: "_id",
            foreignField: "fundId",
            as: "shares"
        }}
    ]).toArray();
    const performances = [];
    for(let i in funds) {
    // const performances = await funds.map(async f => {
        let f = funds[i];
        let fs = { fundId: f._id, code: f.code, currency: f.currency, name: f.name, shares: [], dealRecords: [] };
        if(f.dealRecords){
            fs.allCost = f.dealRecords.reduce((allCost, dr) => {
                let dealDate = moment(dr.dealedAt).format("YYYY-MM-DD");
                if( dealDate <= date){
                    fs.dealRecords.push(dr);
                    return allCost + dr.spent;
                }
                return allCost;
            }, 0);    
        } else {
            fs.allCost = 0;
        }
        fs.totalShareCap = 0;
        fs.totalShareCost = 0;

        f.shares.forEach(share => {
            const stat = shareStatMap[share._id];
            share.amount = 0;
            share.cost = 0;
            const destCurrency = f.currency;
            const srcCurrency = share.currency;
            let price;
            if(stat) {
                //get sharePrice, forex on that date
                price = priceMap[share.code];
                if(!price)
                    return;
                let forex = 1;
                forexes.forEach(f=>{
                    if(f.dest==destCurrency && f.src==srcCurrency){
                        forex = f.latest;
                    }
                });
                share.amount = stat.totalAmount;
                share.cost = stat.totalCost;
                fs.totalShareCost += stat.totalCost * forex;
                fs.totalShareCap += stat.totalAmount * price * forex;
            }
            if(share.amount>0){
                // console.log(share.name + " price:" + price);
                fs.shares.push({name: share.name, currency:share.currency, code: share.code, cost: share.cost, amount: share.amount, price: price});
            }
        });
        fs.trackDate = date; // moment(date).format("YYYY-MM-DD");
        if (autoSave) {
            await config.db.collection("fundTracks").update({ fundId: fs.fundId, trackDate: fs.trackDate }, fs, { upsert: true, multi: false });
        }
        // fs.latestDealRecods = f.dealRecords;
        performances.push(fs);
    }
    // db.close();
    return performances;
}
