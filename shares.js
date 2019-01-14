// var db = require('./dbconn');
// const mongojs = db.mongojs;
// const mongo = require("./mongoConn");
// var sharesDB = db.collection("shares");
var config = require("./config");
async function _exportStocks(){
    const shares = await config.db.collection("shares").aggregate([
        {
            "$lookup": {
                from: "dealRecords",
                localField: "_id",
                foreignField: "shareId",
                as: "dealRecords"
            }
        }]).toArray();
    const _funds = await config.db.collection("funds").find().toArray();
    const funds = _funds.reduce((acc,cur)=> Object.assign(acc,{[cur._id]:cur}), {});
    const newShares = shares.map(share => {
        let totalAmount = 0;
        let totalCost = 0;
        share.dealRecords.forEach(dr => {
            totalAmount += dr.amount;
            totalCost += (dr.amount * dr.price) + dr.fee;
        });
        const costPrice = totalAmount ? totalCost / totalAmount : 0;
        const gain = share.latestPrice * totalAmount - totalCost;
        const marketCap = (share.latestPrice * totalAmount).toFixed(2);
        const gainrate = costPrice > 0 ? gain / (costPrice * totalAmount) : (gain > 0 ? 9.9999 : -9.9999);
        const fund = funds[share.fundId].name;
        const ret = { ...share, amount: totalAmount, costPrice, gain, gainrate, totalCost, marketCap, fund };
        return ret;
    });
    // sorted by fund
    let list = newShares.sort((a, b) => {
        return a.fund > b.fund ? 1 : -1;
    });
    const marketCapUsd = "美元市值";
    const hldPercent = "持仓";
    var _headers = ["name", "code", "amount", "costPrice", "latestPrice", "currency", marketCapUsd, hldPercent, "sector", "country", "fund"];
    const marketCapCol = String.fromCharCode(65 + _headers.indexOf(marketCapUsd));
    const hldPercentCol = String.fromCharCode(65 + _headers.indexOf(hldPercent));
    const hkdRef = String.fromCharCode(65 + _headers.length + 1) + 2;
    const cnyRef = String.fromCharCode(65 + _headers.length + 1) + 3;
    const totalCapRef = String.fromCharCode(65 + _headers.length + 2) + 2;

    var headers = _headers
        .map((v, i) => Object.assign({}, { v: v, position: String.fromCharCode(65 + i) + 1 }))
        .reduce((prev, next) => Object.assign({}, prev, { [next.position]: { v: next.v } }), {});
    var data = list
        .map((v,i)=>{
            const row = {};
            _headers.forEach((vh,j) => {
                const cellIndex = String.fromCharCode(65 + j) + (i + 2);
                row[cellIndex] = {v:v[vh]};
                if (["amount","latestPrice"].indexOf(vh)>=0 && isNaN(v[vh])) {
                    row[cellIndex] = undefined;
                }
                if (["sector","country"].indexOf(vh)>=0 && v[vh]==null) {
                    row[cellIndex] = undefined;
                }
                const marketCap = isNaN(v.marketCap) ? 0 : v.marketCap;
                if(vh==marketCapUsd){
                    if(v.currency=="USD") {
                        row[cellIndex] = {v: marketCap};
                    }
                    if(v.currency=="HKD") {
                        row[cellIndex] = {f: `${marketCap}/${hkdRef}`};
                    }
                    if(v.currency=="CNY") {
                        row[cellIndex] = {f:  `${marketCap}/${cnyRef}`};
                    }
                    row[cellIndex].t = "n";
                    row[cellIndex].z = "#,##0.00";
                }
            });
            return row;
        }).reduce((acc,cur)=>{
            return Object.assign(acc,cur);
        },{});
    list.forEach((item, i)=>{
        data[hldPercentCol + (i + 2)] = {f:`${marketCapCol + (i + 2)}/${totalCapRef}`, z: "0.00%"};
    });
    var output = Object.assign({}, headers, data);
    output[String.fromCharCode(65 + _headers.length) + 1] = {v: "汇率"};
    output[String.fromCharCode(65 + _headers.length) + 2] = {v: "USD/HKD"};
    output[String.fromCharCode(65 + _headers.length) + 3] = {v: "USD/CNY"};
    output[String.fromCharCode(65 + _headers.length + 2) + 1] = {v: "总市值(USD)"};
    output[totalCapRef] = {f: `sum(${marketCapCol}:${marketCapCol})`, t: "n"};
    let forex = await config.db.collection("currencies").find({src:"USD", dest:"HKD"}).sort({date:-1}).limit(1).toArray();
    output[String.fromCharCode(65 + _headers.length + 1) + 2] = {v: forex[0].latest, t: "n"};
    forex = await config.db.collection("currencies").find({src:"USD", dest:"CNY"}).sort({date:-1}).limit(1).toArray();
    output[String.fromCharCode(65 + _headers.length + 1) + 3] = {v: forex[0].latest, t: "n"};
    var ref = 'A1:' + String.fromCharCode(65 + _headers.length + 2) + (list.length + 1);
    output = Object.assign({}, output, { '!ref': ref });
    return output;
}
async function _exportBonds(){
    const bonds = await config.db.collection("bonds").find().toArray();
    
    const marketCapUsd = "美元市值";
    const hldPercent = "持仓";
    const _headers = ["name", "code", "boughtPrice", "latestSellPrice", "YTM", "couponRate", "cost", "marketCap", "boughtDate", "maturityDate", "moodyRating", "selfRating", "currency", "broker", "sector", "country"];

    const headers = _headers
        .map((v, i) => Object.assign({}, { v: v, position: String.fromCharCode(65 + i) + 1 }))
        .reduce((prev, next) => Object.assign({}, prev, { [next.position]: { v: next.v } }), {});
    const data = bonds
        .map((v,i)=>{
            const row = {};
            _headers.forEach((vh,j) => {
                const cellIndex = String.fromCharCode(65 + j) + (i + 2);
                row[cellIndex] = {v:v[vh]};
            });
            return row;
        }).reduce((acc,cur)=>{
            return Object.assign(acc,cur);
        },{});
    let output = Object.assign({}, headers, data);
    const ref = 'A1:' + String.fromCharCode(65 + _headers.length - 1) + (bonds.length + 1);
    output = Object.assign({}, output, { '!ref': ref });
    return output;
}
exports.exportExcel = async function (req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const XLSX = require("xlsx");
    const stockData = await _exportStocks();
    const bondsData = await _exportBonds();
    let wb = {
        SheetNames: ['股票数据', '债券数据'],
        Sheets: {
            '股票数据': stockData, //Object.assign({}, output, { '!ref': ref })
            '债券数据': bondsData,
        }
    };
    const path = require('path');
    const fs = require('fs');
    const fileName = 'output.xlsx';
    const filePath = path.join(__dirname, fileName);
    //XLSX.utils.encode_cell
    XLSX.writeFile(wb, filePath);
    const stats = fs.statSync(filePath); 
    res.set({
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename='+fileName,
        'Content-Length': stats.size
        });
    fs.createReadStream(filePath).pipe(res);
    return next();
}
exports.findAllShares = async function (req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    let queryObj = {};
    if (req.query.name) {
        queryObj.name = { $regex: req.query.name, $options: "i" };
    }
    if (req.query.code) {
        queryObj.code = { $regex: req.query.code, $options: "i" };
    }
    if (req.query.currency) {
        queryObj.currency = req.query.currency;
    }
    if (req.query.fundId) {
        queryObj.fundId = config.ObjectId(req.query.fundId);
    }
    if (req.query.sector) {
        queryObj.sector = req.query.sector;
    }
    // const db = await mongo.connDB();
    const cnt = await config.db.collection("shares").count(queryObj);
    // db.sharesDB.count(queryObj, function(err,count){
    // if (err){
    //     return next(err);
    // }
    let currentPage = parseInt(req.query.page, 10);
    if (!currentPage)
        currentPage = 1;
    let pageSize = parseInt(req.query.limit, 10);
    if (!pageSize)
        pageSize = 10;
    let skips = (currentPage - 1) * pageSize;
    const { sortfield, sortorder } = req.query;
    // const sort = {};
    // if(sortfield) {
    //     // if (sortfield==="totalMarketCap") {

    //     // } else if (sortfield==="totalCost") {
    //     //     sort = {$multiply: [ "$price", "$quantity" ], };
    //     // } else 
    //     {
    //         sort[sortfield] = sortorder === "ascend" ? 1 : -1;    
    //     }
    // }
    // const test = await config.db.collection("shares").find(queryObj).toArray();
    const shares = await config.db.collection("shares").aggregate([
        { $match: queryObj },
        // { 
        //     $project: { name: 1, code: 1, latestPrice: 1, amount: 1,
        //         currency: 1, fundId: 1, 
        //         gainrate: { $divide: [ "$gain", { $multiply: [ "$latestPrice", "$amount" ]} ]}, // (record.gain / (record.cost * record.amount)
        //         totalcost: { $multiply: [ "$latestPrice", "$amount" ] },
        //         totalcap: { $multiply: [ "$cost", "$amount" ] },
        //     }
        // },
        // {$sort: sort},
        // {$skip: skips},
        // {$limit: pageSize},
        {
            "$lookup": {
                from: "dealRecords",
                localField: "_id",
                foreignField: "shareId",
                as: "dealRecords"
            }
        }]).toArray();
    const newShares = shares.map(share => {
        let totalAmount = 0;
        let totalcost = 0;
        share.dealRecords.forEach(dr => {
            totalAmount += dr.amount;
            totalcost += (dr.amount * dr.price) + dr.fee;
        });
        const cost = totalAmount ? totalcost / totalAmount : 0;
        const gain = share.latestPrice * totalAmount - totalcost;
        const totalcap = share.latestPrice * totalAmount;
        const gainrate = cost > 0 ? gain / (cost * totalAmount) : (gain > 0 ? 9.9999 : -9.9999);
        const ret = { ...share, amount: totalAmount, cost: cost, gain: gain, gainrate, totalcost, totalcap };
        return ret;
    });
    let list = newShares.sort((a, b) => {
        let result;
        if (typeof (a[sortfield]) === "string") {
            result = a[sortfield][0] > b[sortfield][0] ? 1 : -1;
        } else {
            result = a[sortfield] > b[sortfield] ? 1 : -1;
        }
        if (sortorder === "ascend") return result;
        else return -result;
    });
    list = list.splice(skips, pageSize);
    // db.close();
    res.send(200, { success: true, list, total: cnt });
    return next();
}

exports.findShares4h5 = async function (req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const shares = await config.db.collection("shares").aggregate([
        {
            "$lookup": {
                from: "dealRecords",
                localField: "_id",
                foreignField: "shareId",
                as: "dealRecords"
            }
        }]).toArray();
    const list = shares.map(share => {
        let totalAmount = 0;
        let totalcost = 0;
        share.dealRecords.forEach(dr => {
            totalAmount += dr.amount;
            totalcost += (dr.amount * dr.price) + dr.fee;
        });
        const cost = totalAmount ? totalcost / totalAmount : 0;
        const gain = share.latestPrice * totalAmount - totalcost;
        const totalcap = share.latestPrice * totalAmount;
        const gainrate = cost > 0 ? gain / (cost * totalAmount) : (gain > 0 ? 9.9999 : -9.9999);
        const ret = { ...share, amount: totalAmount, cost: cost, gain: gain, gainrate, totalcost, totalcap };
        return ret;
    });
    // let list = newShares.sort((a,b)=>{
    //     let result;
    //     if (typeof(a[sortfield])==="string"){
    //         result = a[sortfield][0] > b[sortfield][0] ? 1 : -1;
    //     } else {
    //         result = a[sortfield] > b[sortfield] ? 1 : -1;
    //     }
    //     if (sortorder==="ascend") return result;
    //     else return -result;
    // });  
    // list = list.splice(skips, pageSize);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   
    res.send(200, { success: true, list });
    return next();
}

exports.findShare = async function (req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    // const db = mongo.connDB();
    const result = await config.db.collection("shares").findOne({ _id: config.ObjectId(req.params.shareId) });
    // db.close();
    res.send(200, result);
    return next();

}
// { name, code, currency, market, industry }
exports.postNewShare = async function (req, res, next) {
    const share = Object.assign({ createdAt: new Date() }, req.body);
    res.setHeader('Access-Control-Allow-Origin', '*');
    // const db = await mongo.connDB();
    share.fundId = config.ObjectId(req.body.fundId);
    const result = await config.db.collection("shares").save(share);
    // db.close();
    res.send(201, result);
    return next();
}
// { name, code, currency, market, industry }
exports.patchShare = async function (req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    // const db = await mongo.connDB();
    const share = Object.assign({ modifiedAt: new Date() }, req.body);
    share.fundId = config.ObjectId(req.body.fundId);
    const { result } =
        await config.db.collection("shares").updateOne(
            { _id: config.ObjectId(req.params.shareId) },
            { $set: share }
        );

    // db.close();
    res.send(201, result);
    return next();
}

exports.deleteShare = async function (req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    // const db = await mongo.connDB();
    try {
        const { result } = await config.db.collection("shares").remove({ _id: config.ObjectId(req.params.shareId) });
        res.send(201, result);
        return next();
    } catch (err) {
        console.error(JSON.stringify(err));
        res.json(500, JSON.stringify(err));
        return next();
    }
}
async function _importShares(share2Import) {
    let bulk = config.db.collection("shares").initializeOrderedBulkOp();
    share2Import.forEach(s => {
        const code = s["代码"];
        const name = s["名称"];
        const bank = s["账户"];
        if (code) {
            let currency = s["品类"];
            let exchange;
            if (currency === "HKD") {
                exchange = "HKEX";
            } else if (currency === "USD") {
                exchange = "NASDAQ";
            } else if (currency === "CNY" || currency === "RMB") {
                if (code.substring(0, 3) === "000" || code.substring(0, 3) === "002"
                    || code.substring(0, 3) === "200" || code.substring(0, 3) === "300") {
                    exchange = "SZ";
                }
                if (code.substring(0, 3) === "600" || code.substring(0, 3) === "601"
                    || code.substring(0, 3) === "603" || code.substring(0, 3) === "900") {
                    exchange = "SH";
                }
                currency = "CNY";
            }
            bulk.find({ code: code, bank: bank }).upsert().updateOne({ $set: { code, name, exchange, currency, bank, createdAt: new Date() } });
        }
    });
    return await bulk.execute();
}
exports.importShares = function (req, res, next) {
    const formidable = require('formidable');
    const fs = require('fs');
    const form = new formidable.IncomingForm();
    form.encoding = 'utf-8';        //设置编辑
    // form.uploadDir = 'upload/';     //设置上传目录
    form.keepExtensions = true;     //保留后缀
    form.maxFieldsSize = 5 * 1024 * 1024;   //文件大小
    form.parse(req, async function (err, fields, files) {
        const moment = require("moment");
        const numeral = require("numeral");
        const fileName = files.file.path;
        let xlsx = require('xlsx');
        const workbook = xlsx.readFile(fileName);
        const sheetNames = workbook.SheetNames;
        // const db = await mongo.connDB();
        // --------------导入股票
        const shareSheet = workbook.Sheets[sheetNames[2]];
        const shareHoldings = xlsx.utils.sheet_to_json(shareSheet);
        // const result = await _importShares(shareHoldings);

        // 导入股票交易明细
        if (sheetNames[3].substring("明细") < 0) {
            res.send(200, { success: false, message: "导入错误的excel文件" });
            return next();
        }
        const dealSheet = workbook.Sheets[sheetNames[3]];
        const dealRecords = xlsx.utils.sheet_to_json(dealSheet);
        // await config.db.collection("dealRecords").drop();
        const shares = await config.db.collection("shares").find().toArray();
        const funds = await config.db.collection("funds").find().toArray();
        let twFundId, bossFundId;
        funds.forEach(f => {
            if (f.name.indexOf("天文") >= 0) {
                twFundId = f._id;
            }
            if (f.name.indexOf("boss") >= 0 || f.name.indexOf("BOSS") >= 0) {
                bossFundId = f._id;
            }
        });
        const shareMap = {};
        shares.forEach(s => {
            shareMap[s.code] = s;
        });
        let bulk = config.db.collection("dealRecords").initializeOrderedBulkOp();
        dealRecords.forEach(dr => {
            if (!dr["代码"]) {
                return;
            }
            let code = dr["代码"].replace(/\s+/, "").replace(/HK/, "");
            if (!code) {
                return;
            }
            code = code.replace(/\.[N|n|o|O]/, "").toUpperCase();
            if (!shareMap[code]) {
                return;
            }
            const shareId = shareMap[code]._id;
            const dealedAt = moment(dr["交易日期"], ["YYYY/M/D", "YYYY-MM-DD", "YYYYMMDD"]).format("YYYY-MM-DD");
            const broker = dr["账户"];
            const price = numeral(dr["买卖价格"]).value();
            const amount = numeral(dr["份额\r\n（+买/-卖）"]).value();
            const dealCost = numeral(dr["本笔成交金额"]).value();
            const fee = dealCost - price * amount;
            const query = { shareId, price, broker, amount, dealedAt };
            if (dr["品类（天文）"] && twFundId) {
                query.fundId = twFundId;
            }
            if (dr["品类（boss)"] && bossFundId) {
                query.fundId = bossFundId;
            }
            bulk.find({ shareId, price, broker, amount, dealedAt }).upsert()
                .updateOne({ shareId, broker, amount, price, fee, dealedAt });
        });
        let r = await bulk.execute();
        // db.close();
        res.send(200, r);
        return next();
    });
}


exports.patchLatesPrice = async function (req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const { result } = await config.db.collection("shares").updateOne(
        { _id: config.ObjectId(req.params.shareId) },
        {
            $set: {
                latestPrice: req.body.latestPrice,
                modifiedAt: new Date(),
            }
        }
    );
    res.send(201, result);
    return next();
}


exports.findAllShareSimple = async function (req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const shares = await config.db.collection("shares").aggregate([
        {
            "$lookup": {
                from: "dealRecords",
                localField: "_id",
                foreignField: "shareId",
                as: "dealRecords"
            }
        }]).toArray();
    const newShares = shares.map(share => {
        let totalAmount = 0;
        // let totalcost = 0;
        share.dealRecords.forEach(dr => {
            totalAmount += dr.amount;
            // totalcost += (dr.amount * dr.price) + dr.fee;
        });
        // const cost = totalAmount ? totalcost / totalAmount : 0;
        // const gain = share.latestPrice * totalAmount - totalcost;
        // const totalcap = share.latestPrice * totalAmount;
        // const gainrate =  cost>0 ? gain / (cost * totalAmount) : (gain > 0 ? 9.9999 : -9.9999);
        const ret = {
            code: share.code,
            name: share.name,
            amount: totalAmount,
            price: share.latestPrice,
        };
        return ret;
    });

    res.send(200, { list: newShares });
    return next();
}