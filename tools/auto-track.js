var config = require("../config");
const fundHistoryTrack = require("./fund-cost-calc").fundHistoryTrack;

async function main(args) {
    
    // let bulk = db.collection("fundTracks").initializeOrderedBulkOp();
    const db = await config.connDB();
    let moment = require("moment");
    for(let date=moment("2018-05-10");date<=moment("2018-05-16");date.add(1,"days")){
        console.log("start calculating fund performances on " + date.format("YYYY-MM-DD"));
        const fundPerformances = await fundHistoryTrack(date.format("YYYY-MM-DD"));
    }
    db.close();
    // const fundPerformances = await fundHistoryTrack("2018-04-27");
    // fundPerformances.forEach(fs=>{
    //     bulk.find({ trackDate:fs.trackDate, fundId: fs.fundId }).upsert().updateOne({
    //     		fundId: fs.fundId,
    //     		currency: fs.currency,
    //     		name: fs.name,
    //     		trackDate: fs.trackDate,
    //     		allCost: fs.allCost,
    //     		totalShareCost: fs.totalShareCost,
    //     		totalShareCap: fs.totalShareCap,
    //     	});
    // });
    // const res = await bulk.execute();
    // db.close();
}

main();
