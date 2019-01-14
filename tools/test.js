var moment = require("moment");
var config = require("../config");

async function main(){
    await config.connDB();
    const deals = await config.db.collection("dealRecords").find().toArray();
    let bulk = await config.db.collection("dealRecords").initializeOrderedBulkOp();
    deals.forEach(d=>{
        const dealedAt = moment(d.dealedAt,"YYYY-M-D").format("YYYY-MM-DD");
        // config.db.collection("dealRecords").update({},{$set: {dealedAt}},{multi:true});
        bulk.find({_id:d._id}).update({$set: {dealedAt}},{multi:true});
    });

    const r = await bulk.execute();
    console.log(r);
    config.db.close();
}

main();