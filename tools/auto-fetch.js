var request = require('request');
var moment = require("moment");
var r2 = require('r2');
const cheerio = require('cheerio');
const fetch=require("node-fetch");
var config = require("../config");
const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransport({
    "host": "smtp.sina.com",
    "port": 465,
    "secureConnection": true, // use SSL
    "auth": {
        "user": 'haomiao_azkaban@sina.com', // user name
        "pass": 'haomiao!@#'         // password
    }
});

var mailOptions = {
    from: 'haomiao_azkaban@sina.com', // sender address mailfrom must be same with the user
    to: 'x@x.com, xx@xx.com', // list of receivers
    subject: '', // Subject line
    text: '', // plaintext body
};

module.exports = {
	getLatestPrices: async function (){
		const allShareWraps = await config.db.collection("shares").aggregate([{$group:{_id:{code:"$code",exchange:"$exchange"}}}]).toArray();
		const allShares = allShareWraps.map(wrap=>wrap._id);
		let querySymbols = allShares.map(share => {
			switch(share.exchange){
				case "NASDAQ" :
				case "NYSE" :
					return "gb_" + share.code.toLowerCase();
				case "HKEX":
					let newSym = share.code;
					for(let i = 0; i < (5 - share.code.length); i++)
						newSym = "0" + newSym; //补齐到5位
					return "hk" + newSym;
				case "SH":
					return "sh" + share.code;
				case "SZ":
					return "sz" + share.code;
			}}
		).join(",");

		console.log("start fetching http://hq.sinajs.cn/list=" + querySymbols);
		
		resBody = await r2("http://hq.sinajs.cn/list=" + querySymbols).text;
		let shareBulk = await config.db.collection("shares").initializeOrderedBulkOp();
		allShares.forEach(share => {
			const begin = resBody.indexOf(share.code.toLowerCase()+"=");
			switch(share.exchange) {
				case "NYSE" :
				case "NASDAQ" :
					var latestPriceFieldIdx = 1;
					var todayBeginPriceFieldIdx = 5;
					var yesterdayEndPriceFieldIdx = 26;
					var maxPriceFieldIdx = 6;
					var minPriceFieldIdx = 7;
					var dateFieldIdx = 3;
					var timeFieldIdx = 100;
					var peRatioIdx = 14;
					var marketCapIdx = 12;
					break;
				case "HKEX":
					var latestPriceFieldIdx = 6;
					var todayBeginPriceFieldIdx = 2;
					var yesterdayEndPriceFieldIdx = 3;
					var maxPriceFieldIdx = 4;
					var minPriceFieldIdx = 5;
					var dateFieldIdx = 17;
					var timeFieldIdx = 18;
					var peRatioIdx = 13;
					var marketCapIdx = 100;
					break;
				case "SH" :
				case "SZ" :
					var latestPriceFieldIdx = 3;
					var todayBeginPriceFieldIdx = 1;
					var yesterdayEndPriceFieldIdx = 2;
					var maxPriceFieldIdx = 4;
					var minPriceFieldIdx = 5;
					var dateFieldIdx = 30;
					var timeFieldIdx = 31;
					var peRatioIdx = 100;
					var marketCapIdx = 100;
					break;

			}
			if(begin<0){
				return;
			}
			const end = resBody.indexOf('"', begin + share.code.length + 2);
			if(end<0){
				return;
			}
			let data = resBody.substring(begin + share.code.length + 2, end);
			const arr = data.split(",");
			let timeAddIn = arr[timeFieldIdx] ? " " + arr[timeFieldIdx]: "";
			let refreshDateTime = new Date(arr[dateFieldIdx] + timeAddIn);
			let priceDate = moment(refreshDateTime).format("YYYY-MM-DD");
			
			if (!arr[latestPriceFieldIdx]) {
				console.log(share.code + "'s price fetch failed. \n" + data);
				return;
			} else {
				console.log(share.code + " price: " + arr[latestPriceFieldIdx] + "\n");
			}

			shareBulk.find({ code: share.code }).upsert().update({
				$set: {
					open: parseFloat(arr[todayBeginPriceFieldIdx]),
					latestPrice: parseFloat(arr[latestPriceFieldIdx]),
					lastRefreshTime: refreshDateTime,
					peRatio: parseFloat(arr[peRatioIdx]),
					marketCap: parseFloat(arr[marketCapIdx]),
					low: parseFloat(arr[maxPriceFieldIdx]), 
					high: parseFloat(arr[minPriceFieldIdx])
				}
			},{multi:true});
		});
		const r = await shareBulk.execute();
		console.log(moment().format("YYYY-MM-DD hh:mm:ss") + " starting to scan deal-records and emit notification");
		const minRemindTime = moment().subtract(60, "minutes").toDate();

		const dealRecords = await config.db.collection("dealRecords").aggregate([
								{ $match: {
										remindType : {$ne: null},
										remindPrice: {$ne: null},
										close: {$ne: true},
										$or: [{remindCount: {$eq: null}}, {remindCount: {$lte: config.maxRemindCount}}],
										$or: [{lastRemindTime: {$eq: null}}, {lastRemindTime: {$lte: minRemindTime}}]
								} },
								{ $lookup: { from: "shares", localField: "shareId", foreignField: "_id", as: "share" } }
							]).toArray();

		console.log(moment().format("YYYY-MM-DD hh:mm:ss") + " complete to scan deal-records");

		for(let i in dealRecords) {
			let deal = dealRecords[i];
			deal.share = deal.share[0];
			let remindFlag = false;
			if(deal.price < deal.remindPrice && deal.share.latestPrice>=deal.remindPrice){
				remindFlag = true;
			}
			if(deal.price > deal.remindPrice && deal.share.latestPrice<=deal.remindPrice){
				remindFlag = true;
			}
			// if(deal.remindType=="gte") {
			// 	if (deal.share.latestPrice>=deal.remindPrice) remindFlag = true;
			// }
			// if(deal.remindType=="lte") {
			// 	if (deal.share.latestPrice<=deal.remindPrice) remindFlag = true;
			// }
			
			if (remindFlag) {
				const message = "Equity " + deal.share.code + "'s price has changed from " + deal.price + " to " + deal.share.latestPrice;
				const createdAt = new Date();
				const notifications = deal.notifications || [];
				notifications.push({createdAt, message });
				remindCount = deal.remindCount ? deal.remindCount + 1 : 1, 
				await config.db.collection("dealRecords").update(
									{ _id: config.ObjectId(deal._id) },
									{ $set: {
										lastRemindTime: createdAt, 
										remindCount,
										notifications
									}});

				const ns = await config.db.collection("notifications").find().toArray();
				const allMails = ns.map(n => n.Endpoint).join(",");
				console.log("mail to " + allMails);
				mailOptions.to = allMails;
				mailOptions.subject = "Notice " + deal.share.name + " price changed";
				mailOptions.text = message;
				transporter.sendMail(mailOptions, function(error, info){
					if(error){
						return console.log(error);
					}
					console.log('Message sent: ' + info.response);
				});						
			}
		}

		console.log(moment().format("YYYY-MM-DD hh:mm:ss") + " getLatestPrices end");
	},
	getHistoryPrices: async function () {
		const allShares = await config.db.collection("shares")
			.aggregate([{$group:{_id:{code:"$code",exchange:"$exchange",historyDS:"$historyDS"}}}]).toArray();

			for(var i in allShares) {
				const share = allShares[i]._id;
				console.log('share exchange == ', share.exchange);
				let url, resp, json;
				let result = [];
				try {
					switch(share.exchange) {
						case "HKEX":
							const today = moment().format("YYYY-MM-DD");
							let newSym = share.code;
							for(let i = 0; i < (5 - share.code.length); i++)
								newSym = "0" + newSym; //补齐到5位
							url = "https://www.quandl.com/api/v3/datasets/HKEX/" + newSym + "?start_date=2018-05-01&end_date=" + today + "&api_key=Wfmd4vUh9yadDKonxR9b";
							console.log(share.code + " start fetching...");
							resp = await fetch(url, {timeout: 3 * 60 * 1000});
							json = await resp.json();
							console.log(share.code + " fetched...");
							result = fetchDataFromQuandlResp(json);
							break;
						case "NYSE":
						case "NASDAQ":
							url = "https://api.iextrading.com/1.0/stock/" + share.code + "/chart/1m";
							console.log(share.code + " start fetching...");
							resp = await fetch(url, {timeout: 3 * 60 * 1000});
							json = await resp.json();
							console.log(share.code + " fetched...");
							json.forEach(aData => {
								result.push({
									date: aData.date,
									open: aData.open,
									close: aData.close,
									high: aData.high,
									low: aData.low,
									volume: aData.volume,
									vwap: aData.vwap
								});
							});
							break;
						case "SH":
						case "SZ":
						default:
							console.log('share.exchange', share.exchange);
							continue;
					}
				} catch(e) {
					console.error('fetch error', e);
					continue;
				}
				let priceBulk = config.db.collection("priceHistories").initializeOrderedBulkOp();
				result.forEach(aData=>{
					priceBulk.find({code: share.code, date:aData.date}).upsert().updateOne({
						code: share.code,
						date: aData.date,
						close: aData.close,
						open: aData.open,
						high: aData.high,
						low: aData.low,
						volume: aData.volume,
					});
				});
				const r = await priceBulk.execute();
		}
	},
	getHistoryForex: async function (){
		const currencyPaires = [
			{ src:"HKD", dest: "USD", pairId: 9651 },
			{ src:"CNY", dest: "USD", pairId: 9536 },
			{ src:"USD", dest: "HKD", pairId: 155 },
			{ src:"CNY", dest: "HKD", pairId: 1564 },
			{ src:"USD", dest: "CNY", pairId: 2111 },
			{ src:"HKD", dest: "CNY", pairId: 1817 }
		];
		const url = "https://cn.investing.com/instruments/HistoricalDataAjax";
		const FormData = require("form-data");
		for(let i in currencyPaires){
			const pair = currencyPaires[i];
			const {src, dest, pairId} = {...pair};
			const form = new FormData();
			form.append('curr_id', pairId);
			form.append('st_date', '2018/05/01');
			form.append('end_date', moment().format("YYYY/MM/DD"));
			form.append('interval_sec', 'Daily');
			form.append('action', 'historical_data');
			const resp = await fetch(url,
				{
					method: "POST",
					headers: { 'X-Requested-With': 'XMLHttpRequest' },
					body: form,
					timeout: 5 * 60 * 1000
				}
			);
			const html = await resp.text();
			const $ = cheerio.load(html);
			const baseSelector = "#curr_table > tbody > tr";
			for(let i=1; i<$(baseSelector).length; i++){
				let date = $(baseSelector+":nth-child(" + i + ") > td:nth-child(1)").text().trim().replace("年","-").replace("月","-").replace("日","");
				date = moment(date,"YYYY-M-D").format("YYYY-MM-DD");
				const latest = parseFloat($(baseSelector+":nth-child(" + i + ") > td:nth-child(2)").text());
				const open = parseFloat($(baseSelector+":nth-child(" + i + ") > td:nth-child(3)").text());
				const high = parseFloat($(baseSelector+":nth-child(" + i + ") > td:nth-child(4)").text());
				const low = parseFloat($(baseSelector+":nth-child(" + i + ") > td:nth-child(5)").text());
				console.log(JSON.stringify({date, dest, src, latest, open, high, low }));
				config.db.collection("currencies").update(
					{date, dest, src},
					{$set: {date, dest, src, latest, open, high, low }},
					{upsert: true}
				);
			}
		}
		return;
	},
	getLatestForex: async function (){
		console.log("getLatestForex-begin");
		const currencies = ["USD","HKD","CNY"];
		for (let k in currencies) {
			tcur = currencies[k];
			let updateObj = {dest: tcur};
			for (let i in currencies) {
				const scur = currencies[i];
				if(scur === tcur) {
					updateObj[scur] = 1;
					continue;
				}
				//{"success":"1","result":{"status":"ALREADY","scur":"USD","tcur":"CNY","ratenm":"美元/人民币","rate":"6.286900","update":"2018-04-18 11:39:14"}}
				const url = "http://api.k780.com/?app=finance.rate&scur=" + scur + "&tcur=" + tcur + "&appkey=32979&sign=a742c1d39370ced72a06ff6fbc6882ae&format=json";
				const body = await r2(url).json;
				updateObj[scur] = body.result.rate;
			}
			updateObj["date"] = moment().format("YYYY-MM-DD");
			updateObj["refreshTime"] = new Date();
			const r = await config.db.collection("currencies").update({dest: tcur},updateObj,{upsert:true});
			console.log("getLatestForex-end");
		}
	},
	getCnStockData: async function() {
		const allSahres = await config.db.collection("shares").find({exchange:{$in:["SH","SZ"]}}).toArray();
		for(let i=0; i<allSahres.length;i++) {
			const share = allSahres[i];
			// const yearJidus = [{year:2017,jidu:1},{year:2017,jidu:2},{year:2017,jidu:3},{year:2017,jidu:4},{year:2018,jidu:1},{year:2018,jidu:2}];
			const yearJidus = [{year:2018,jidu:2}];
			for(let j=0;j<yearJidus.length;j++) {
				yearJidu = yearJidus[j];
				let url = "http://money.finance.sina.com.cn/corp/go.php/vMS_MarketHistory/stockid/"
					+ share.code + ".phtml?year=" + yearJidu.year + "&jidu=" + yearJidu.jidu;
				const resp = await fetch(url, {timeout: 5 * 60 * 1000});
				const html = await resp.text();
				const $ = cheerio.load(html);
				const baseSel = "#FundHoldSharesTable > tbody > tr";
				for(let k=2; k<$(baseSel).length; k++) {
					const date = $(baseSel+":nth-child(" + k + ") > td:nth-child(1)").text().trim();
					const open = parseFloat($(baseSel+":nth-child(" + k + ") > td:nth-child(2)").text());
					const high = parseFloat($(baseSel+":nth-child(" + k + ") > td:nth-child(3)").text());
					const close = parseFloat($(baseSel+":nth-child(" + k + ") > td:nth-child(4)").text());
					const low = parseFloat($(baseSel+":nth-child(" + k + ") > td:nth-child(5)").text());
					const volume = parseFloat($(baseSel+":nth-child(" + k + ") > td:nth-child(6)").text());
					await config.db.collection("priceHistories").update(
						{code: share.code, date: date},
						{code: share.code, date:date, open:open, high:high, close:close, low:low, volume:volume},
						{upsert:true}
					);
					// priceBulk.find({code: share.code, date: date}).upsert()
					//	.updateOne({date, open, high, close, low, volume});
				}
			}
		}
	}
}
function fetchDataFromQuandlResp(res){
	if(!res.dataset) {
		console.log(JSON.stringify(res));
		return [];
	}
	let indexMap = {};
	for (let j in res.dataset.column_names) {
		indexMap[res.dataset.column_names[j]] = j;
	}
	let result = [];
	for (let k in res.dataset.data) {
		const dailyData = res.dataset.data[k];
		const date = dailyData[indexMap["Date"]];
		let open, close;
		if(indexMap["Open"]){
			open = dailyData[indexMap["Open"]];
		}else{
			open = dailyData[indexMap["Previous Close"]];
		}
		if(indexMap["Close"]){
			close = dailyData[indexMap["Close"]];
		}else{
			close = dailyData[indexMap["Nominal Price"]];
		}
		const high = dailyData[indexMap["High"]];
		const low = dailyData[indexMap["Low"]];
		const volume = dailyData[indexMap["Volume"]];
		result.push({ date, close, open, high, low, volume });
	}
	return result;
}
// getHistoryForex();
// getCnStockData();
// getLatestPrices();
// getLatestForex();
// getHistoryPrices();
//console.log("auto-fetch-end: " + (new Date()));
//fetchCurrencies();

