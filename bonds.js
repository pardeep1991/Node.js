var config = require("./config");

// 查找所有债券的数据
exports.findAllBonds = async function(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const name = req.query.name;
    const code = req.query.code;
    const page = parseInt(req.query.page || 1);
    const limit = parseInt( req.query.limit || 10);
    const fundId = req.query.fundId;
    const skip = (page - 1) * limit;
    const { sortfield, sortorder } = req.query;

    let query = {};
    if (name) query.name = name;
    if (code) query.code = code;
    if (fundId) query.fundId = config.ObjectId(fundId);

    const cnt = await config.db.collection('bonds').count(query);

    const bonds = await config.db.collection('bonds').find(query).skip(skip).limit(limit).toArray();

    // const newBonds = bonds.map(bond=>{
    //     const cost = totalAmount ? totalcost / totalAmount : 0;
    //     const gain = bond.latestPrice * totalAmount - totalcost;
    //     const totalcap = bond.totalCap;
    //     const gainrate = cost > 0 ? gain / (cost * totalAmount) : (gain > 0 ? 9.9999 : -9.9999);
    //     const ret = { ...bond, amount: totalAmount, cost, gain, gainrate, totalcost, totalcap }
    //     return ret;
    // });                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            
    res.send(200 , { success: true, list: bonds, total: cnt });
    return next();
}

// 查找一个债券的
exports.findBond = async function(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const aBond = await config.db.collection("bonds").findOne({ _id: config.ObjectId(req.params.bondId) });
    res.send(200, aBond);
    return next();
}

// 新增一个债券的
exports.postNewBond = async function(req, res, next) {
    const bond = { ...(req.body), createdAt: new Date() };
    res.setHeader('Access-Control-Allow-Origin', '*');
    const result = await config.db.collection('bonds').save(bond);
    res.send(201, result);
    return next();
}

// 修改一个债券的， 
exports.patchBond = async function(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const updateObj = {...(req.body), cost: parseInt(req.body.cost), modifiedAt: new Date()};
    const result = await config.db.collection("bonds").updateOne(
        { _id: config.ObjectId(req.params.bondId) },
        { $set: updateObj },
    );
    res.send(201, result);
    return next();
}

// 删除一个债券的， 债券的id
exports.delBond = async function(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const result = await config.db.collection('bonds').remove({ _id: config.ObjectId(req.params.bondId) });
    res.send(201, result);
    return next();
}

exports.findBondsIdNames = async function(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const bonds = await config.db.collection("bonds").find({}, { name: 1 }).toArray();
    res.send(201, bonds);
    return next();
}

exports.patchLatesPrice = async function(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const { result } = await config.db.collection("bonds").updateOne({ _id: config.ObjectId(req.params.bondId) }, {
        $set: {
            latestPrice: req.body.latestPrice,
            modifiedAt: new Date(),
        }
    });
    res.send(201, result);
    return next();
}

exports.findBonds4h5 = async function(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    // const bonds = await config.db.collection('bonds').aggregate([{
    //     "$lookup": {
    //         from: 'dealRecords',
    //         localField: '_id',
    //         foreignField: 'shareId',
    //         as: 'dealRecords'
    //     }
    // }]).toArray();
    const bonds = await config.db.collection('bonds').find({}).toArray();
    const list = bonds.map(bond=>{
        let totalAmount = bond.amount;
        let totalcost = bond.cost;
        const cost = totalAmount ? totalcost / totalAmount : 0;
        const gain = bond.latestPrice * totalAmount - totalcost;
        const totalcap = bond.totalCap;
        const gainrate = cost > 0 ? gain / (cost * totalAmount) : (gain > 0 ? 9.9999 : -9.9999);
        const ret = { ...bond, amount: totalAmount, cost, gain, gainrate, totalcost, totalcap }
        return ret;
    });

    res.send(200, { success: true, list });
    return next();
}