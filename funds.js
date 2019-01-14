var config = require("./config");
// var db = require('./dbconn');
// const mongojs = db.mongojs;
// const mongo = require("./mongoConn");
// const mongodb = require("./mongoConn").db;
exports.currencyConvert = async function(req, res, next){
    res.setHeader('Access-Control-Allow-Origin','*');
    // const db = await mongo.connDB();
    const currencyConvertMap = {};
    const currencyConvertList = await config.db.collection("currencies").find().toArray();
    currencyConvertList.forEach(cc=>{
        currencyConvertMap[cc.dest] = { "USD": cc.USD, "HKD": cc.HKD, "CNY": cc.CNY, "fetchTime": cc.refreshTime };
    });
    res.send(201, currencyConvertMap);
    return next();
};
exports.findAllFunds = async function(req , res , next) {
    const moment = require('moment');
    res.setHeader('Access-Control-Allow-Origin','*');
    // const destCurrency = req.query.currency;
    let today = moment().format("YYYY-MM-DD");
    // const fundHistoryTrack = require("./tools/fund-cost-calc").fundHistoryTrack;
    // const fundPerformances = await fundHistoryTrack(today, false);
    // const db = await mongo.connDB();
    // const funds = await config.db.collection("funds").find().toArray();
    // const fundPerformances = await config.db.collection("fundTracks").find().sort({trackDate:-1}).limit(funds.length).toArray();
    // const newPerformances = fundPerformances.map(fp=>{
    //     for(let i in funds){
    //         if( funds[i]._id.equals(fp.fundId)){
    //             fp.dealRecords = funds[i].dealRecords;
    //         }
    //     }
    //     return fp;
    // });
    //const funds = await config.db.collection("funds").find().toArray();
    const funds = await config.db.collection("funds").aggregate([{
            "$lookup": {
                from: "fundTracks",
                localField: "_id",
                foreignField: "fundId",
                as: "tracks"
            }
        }]).toArray();

    funds.forEach(fund=>{
        fund.tracks.sort((a,b)=>{
          if( a.trackDate > b.trackDate) return -1;
          if( a.trackDate == b.trackDate) return 0;
          if( a.trackDate < b.trackDate) return 1;
        });
    });
    // const cost = funds.dealRecords.reduce((accu,cur) => accu += cur.money, 0);
    // const tracks = [];
    // for (let i=0; i<funds.length; i++) {
    //     const f = funds[i];
    //     let t = await config.db.collection("fundTracks").find({fundId: f._id}).sort({ trackDate: -1 }).limit(1).toArray();
    //     if (t.length==0) {
    //         t = {};
    //     } else {
    //         t = t[0];
    //     }
    //     t.fund = f;
    //     tracks.push(t);
    // }
    const forexes = await config.db.collection("currencies").find({},{dest:1,src:1,latest:1}).sort({date:-1}).limit(6).toArray();
    res.send(201, { funds, forexes: forexes });
    return next();
}

exports.findFundIdNames = async function(req , res , next) {
    res.setHeader('Access-Control-Allow-Origin','*');
    // const db = await mongo.connDB();
    const funds = await config.db.collection("funds").find({},{name:1}).toArray();
    // db.close();
    res.send(201, funds);
    return next();
}
exports.findFund = async function(req, res , next){
    res.setHeader('Access-Control-Allow-Origin','*');
    // const db = await mongo.connDB();
    const aFund = await config.db.collection("funds").findOne({_id:config.ObjectId(req.params.fundId)});
    // db.close();
    res.send(200 , aFund);
    return next();
}
exports.patchFund = async function(req , res , next) {
    res.setHeader('Access-Control-Allow-Origin','*');
    const updateObj = {...(req.body), modifiedAt: new Date()};
    const result = await config.db.collection("funds").updateOne(
        {_id: config.ObjectId(req.params.fundId) },
        { $set: updateObj },
    );
    res.send(201, result);
    return next();
}
// { shareId, dealedAt, price, amount, broker, fee, note }
exports.postNewFund = async function(req , res , next){
    const fund = { ...(req.body), createdAt: new Date() }; // Object.assign({createdAt: new Date()}, req.body);
    res.setHeader('Access-Control-Allow-Origin','*');
    // const db = await mongo.connDB();
    const result = await config.db.collection("funds").save(fund);
    // db.close();
    res.send(201 , result);
    return next();
}
exports.delFund = async function(req , res , next){
    res.setHeader('Access-Control-Allow-Origin','*');
    // const db = await mongo.connDB();
    const result = await config.db.collection("funds").remove({_id:config.ObjectId(req.params.fundId)});
    // db.close();
    res.send(201 , result);
    return next();
}
exports.patchDealRecords = async function(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin','*');
    const moment = require("moment");
    moment.locale("zh-cn");
    //req.body.fundId
    // const drs = req.body.dealRecords.map(dr=>{
    //     let result = { ...dr, dealedAt: moment(r.dealedAt).format("YYYY-MM-DD") };
    //     // if (!dr.id) {
    //     //     result = { ...dr, id: config.ObjectId(), dealedAt: moment(dr.dealedAt).format("YYYY-MM-DD") };
    //     // } else {
    //     //     result = { ...dr, dealedAt: moment(r.dealedAt).format("YYYY-MM-DD") };
    //     // }
    // });
    // const db = await mongo.connDB();
    const newFund = await config.db.collection("funds").updateOne(
        { _id: config.ObjectId(req.params.fundId) },
        { $set: {dealRecords: req.body.dealRecords} },
    );
    // db.close();
    res.send(201, newFund);
    return next();
}

exports.tracks = async function(req, res, next){
    res.setHeader('Access-Control-Allow-Origin','*');
    // const db = await mongo.connDB();
    const start = req.query.start;
    const end = req.query.end;
    const result = await config.db.collection("fundTracks").find({ trackDate: {$gte: start, $lte: end} }).sort({trackDate: 1}).toArray();
    // db.close();
    res.send(201,result);
    return next();
}
exports.genLatestTrack = async function(req , res , next) {
    res.setHeader('Access-Control-Allow-Origin','*');
    const fundId = req.params.fundId;
    const trackDate = req.query.date;
    const fund = await config.db.collection("funds").findOne({_id:config.ObjectId(fundId)});
    // this is allCost for the specific fund including remain cash
    const allCost = fund.dealRecords.reduce((accu, cur) => accu + cur.money, 0);
    const shareMap = {};
    const shareIds = [];
    const forexes = await config.db.collection("currencies").find().toArray();
    const priceHistories = await config.db.collection("priceHistories").find({date:trackDate}).toArray();
    const priceMap = priceHistories.reduce((accu,cur)=>{
        accu[cur.code] = cur.close;
        return accu;
    },{});
    const shares = await config.db.collection("shares").find({fundId:config.ObjectId(fundId)}).toArray();
    shares.forEach(s=>{
        shareIds.push(s._id);
        shareMap[s._id] = s;
    });
    const shareDealRecords = await config.db.collection("dealRecords").find({
        shareId: {$in: shareIds}
    }).toArray();
    let totalShareCap = 0;
    let totalExpense = 0;
    const trackDateForexes = forexes.filter(f=>f.date==trackDate);    
    shareDealRecords.forEach(dr=>{
        const share = shareMap[dr.shareId];
        let historyForex,trackDateForex;
        if(share.currency==fund.currency){
            historyForex = 1;
            trackDateForex = 1;
        } else {
            historyForex = forexes.find(f => f.src==share.currency && f.dest==fund.currency && f.date==trackDate).latest; 
            trackDateForex = trackDateForexes.find(f => f.src==share.currency && f.dest==fund.currency).latest;  
        }
        const sharePrice = priceMap[share.code] || share.latestPrice;
        totalShareCap += dr.amount * sharePrice * trackDateForex;
        totalExpense += (dr.amount * dr.price + dr.fee) * historyForex;
    });
    // const cash = allCost - totalExpense;
    // const moment = require('moment');
    res.send(201,{trackDate, allCost, totalExpense, totalShareCap});
}
exports.patchTrack = async function(req , res , next) {
    res.setHeader('Access-Control-Allow-Origin','*');
    const updateObj = { ...(req.body), fundId: config.ObjectId(req.body.fundId) };
    const result = await config.db.collection("fundTracks").updateOne(
        {_id: config.ObjectId(req.params.trackId) },
        { $set: updateObj },
    );
    res.send(201, result);
    return next();
}
exports.createTrack = async function(req , res , next) {
    res.setHeader('Access-Control-Allow-Origin','*');
    const track = { ...(req.body), fundId: config.ObjectId(req.body.fundId) };
    let result = await config.db.collection("fundTracks").save(track);
    result.track = track;
    res.send(201, result);
    return next();
}
exports.deleteTrack = async function(req , res , next) {
    res.setHeader('Access-Control-Allow-Origin','*');
    
    const result = await config.db.collection("fundTracks").remove({_id:config.ObjectId(req.params.trackId)});
    res.send(201, result);
    return next();
}
exports.findFunds4h5 = async function(req, res, next){
    res.setHeader('Access-Control-Allow-Origin','*');
    const result = await config.db.collection("funds").find().toArray();
    res.send(200, result);
    return next();
}
