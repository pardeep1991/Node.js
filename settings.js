var AWS = require('aws-sdk');
var config = require("./config");

AWS.config.region = config.region; //process.env.REGION;

exports.fetchAllRemindees = async function(req, res, next){
    const notifications = await config.db.collection("notifications").find().toArray();
    res.json(200, {success: true, list: notifications})
    return next();
};
exports.delRemindee = async function(req, res, next){
    await config.db.collection("notifications").remove({"SubscriptionArn": req.params.arn});
    res.json(200, {success: true});
    return next();
};
exports.addRemindee = async function(req, res, next) {
    await config.db.collection("notifications").save({
        TopicArn: req.body.Endpoint,
        Protocol: req.body.Protocol,
        SubscriptionArn: req.body.Endpoint,
        Endpoint: req.body.Endpoint,
    });
    res.json(200, {success: true});
    return next();
};