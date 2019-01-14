var AWS = require('aws-sdk');
var moment = require("moment");
var config = require("./config");

moment.locale("zh-cn");
AWS.config.region = config.region; //process.env.REGION;

exports.enableDealReminder = async function(req, res, next) {
    try{
        const close = JSON.parse(req.query.close);
        const r = await config.db.collection("dealRecords")
            .update({_id: config.ObjectId(req.params.dealId)},{$set:{close}});
        if(r.result.ok){
            res.json({success: true});
        } else {
            res.json({success: false, message: "No deal match this ID: " + req.params.dealId});
        }
        return next();
    } catch(err){
        console.error("update deal reminder error: "+err);
        res.json(500, {success: false, message: JSON.stringify(err)});
        return next();
    }
};
exports.dealNotifyTest = async function(req, res, next) {
    let deal = await config.db.collection("dealRecords").aggregate([
        { $match: {_id: config.ObjectId(req.params.dealId)} },
        { $lookup: { from: "shares", localField: "shareId", foreignField: "_id", as: "share" } }
    ]).toArray();
    if(!deal){
        res.json(200, {success: false, message: "no deal math this dealId." });
        return next();
    }
    deal = deal[0];
    deal.share = deal.share[0];

    // sns.publish({
    //     TopicArn: config.TopicArn,
    //     Subject: "notification test for " + deal.share.code + " deal",
    //     Message: "price has changed to " + deal.remindType + " " + deal.remindPercent + "%",
    // }, function(err, data){
    //     if(err){
    //         res.json(200, {success: false, message: JSON.stringify(err)});
    //         return next();
    //     }else{
    //         res.json(200, {success: true, message: "publish notification success."});
    //         return next();
    //     }
    // });
},
exports.patchDealRecord = async function(req , res , next) {
    res.setHeader('Access-Control-Allow-Origin','*');
    const moment = require("moment");
    moment.locale("zh-cn");
    // const db = await mongo.connDB();
    let myfee, myallcost;
    if(!req.body.allcost && !req.body.fee){
        res.send(400,{success:false, message:"成本和佣金不能同时为0"});
        return next();
    }
    if(!req.body.fee){
        myfee = req.body.allcost - req.body.price * req.body.amount;
        myallcost = req.body.allcost;
    } else {
        myfee = req.body.fee;
        myallcost = req.body.price * req.body.amount + myfee;
    }
    const dealRecord = { ...req.body, fee: myfee, allcost: myallcost, dealedAt: moment(req.body.dealedAt).format("YYYY-MM-DD"), modifiedAt: new Date() }; 
    const r = await config.db.collection("dealRecords").update({_id: config.ObjectId(req.params.recordId)},{$set: dealRecord});
    
    res.send(201, { success:true, result: r.result });
    return next();
    //sns 创建主题
    // sns.createTopic({name: "dealRecord-"+req.params.recordId}, async function(err, data) {
    //   if (err) console.log(err, err.stack); // an error occurred
    //   else {
    //     const topicArn = data.TopicArn;
    //     await config.db.collection("dealRecords").update({_id: config.ObjectId(req.params.recordId)},{$set: { topicArn }});
    //     for(let i in req.body.remindees){
    //         const remindee = remindees[i];
    //         if(remindee.mobilePhone){
    //             sns.subscribe({
    //                 Protocol: 'email', 
    //                 TopicArn: topicArn, 
    //                 Endpoint: remindee.email,
    //             },function(err,data){
    //                 console.log(data);
    //             });
    //         }
    //         if(remindee.mobilePhone){
    //             sns.subscribe({
    //                 Protocol: 'sms',
    //                 TopicArn: topicArn, 
    //                 Endpoint: remindee.mobilePhone,
    //             },function(err,data){
    //                 console.log(data);
    //             });};
    //     }
    //   }
    // });
    //遍历所有remindee, 订阅该主题
    //创建一个扫描，当价格到达提醒点时，触发提醒

    // sns.publish({
    //     'Message': 'Name: ' + req.body.name + "\r\nEmail: " + req.body.email 
    //                         + "\r\nPreviewAccess: " + req.body.previewAccess 
    //                         + "\r\nTheme: " + req.body.theme,
    //     'Subject': 'New user sign up!!!',
    //     'TopicArn': snsTopic
    // }, function(err, data) {
    //     if (err) {
    //         res.status(500).end();
    //         console.log('SNS Error: ' + err);
    //     } else {
    //         res.status(201).end();
    //     }
    // }); 
}
// { shareId, dealedAt, price, amount, broker, fee, note }
exports.postNewDealRecord = async function(req , res , next){
    let myfee, myallcost;
    if(!req.body.allcost && !req.body.fee){
        res.send(400,{success:false,message:"成本和佣金不能同时为0"});
        return next();
    }
    if(!req.body.fee){
        myfee = req.body.allcost - req.body.price * req.body.amount;
        myallcost = req.body.allcost;
    } else {
        myfee = req.body.fee;
        myallcost = req.body.price * req.body.amount + myfee;
    }
    const dealRecord = { ...req.body, fee: myfee, allcost: myallcost, dealedAt: moment(req.body.dealedAt).format("YYYY-MM-DD"), createdAt: new Date() }; 
    //Object.assign({createdAt: new Date()}, req.body);
    dealRecord.shareId = config.ObjectId(req.body.shareId);
    dealRecord.dealedAt = moment(req.body.dealedAt).format("YYYY-MM-DD");
    res.setHeader('Access-Control-Allow-Origin','*');
    // const db = await mongo.connDB();
    const result = await config.db.collection("dealRecords").save(dealRecord);
    // db.close();
    res.send(201 , result);
    return next();
}
exports.delDealRecord = async function(req , res , next){
    res.setHeader('Access-Control-Allow-Origin','*');
    // const db = await mongo.connDB();
    const result = await config.db.collection("dealRecords").remove({_id:config.ObjectId(req.params.recordId)});
    // db.close();
    res.send(201 , result);
    return next();
}