var jwt    = require('jsonwebtoken');
var md5    = require("md5");
var config = require("./config");

module.exports = {
    logout: function(req, res, next) {
        res.setCookie("token",null, {path: "/"});
        res.send(200, { success: true, token: null });
        return next();
    },
    checkToken: function(req, res, next) {
        // get token from cookie
        let tokenCookie = "null";
        let start = 0;
        while(req.headers.cookie && tokenCookie==="null") {
            const begin = req.headers.cookie.indexOf("token=", start);
            if(begin<0){
                break;
            }
            let end = req.headers.cookie.indexOf(";", begin);
            if (end < 0){
                end = req.headers.cookie.length;
            }
            start = end;
            tokenCookie = req.headers.cookie.substring(begin + 6, end);
        }
        if(tokenCookie==="null"){
            tokenCookie = null;
        }
        var token = tokenCookie || (req.body ? req.body.token : null) || req.query.token || req.headers['x-access-token'];
        if (token) {
            jwt.verify(token, config.secret, function(err, decoded) {      
                if (err) {
                    return res.json(401, { success: false, message: 'Failed to authenticate token.' });    
                } else {
                    req.decoded = decoded;    
                    return next();
                }
            });
        } else {
            return res.json(401, {
                success: false, 
                message: 'No token provided.'	
            });
        }
    },
    fetchAllUsers: async function(req, res, next) {
        try{
            const users = await config.db.collection("user").find().toArray();
            res.send(200, { success: true, users });
            return next();
        } catch(error){
            res.send(500, { success: false, message: JSON.stringify(error) });
            return next();
        }
    },
    login: async function(req, res, next) {
        const user = await config.db.collection("users").findOne({username: req.body.username});

        if (!user) {
            res.json(401, { success: false, message: 'Authentication failed. User not found.' });
            return;
        }
        // check if password matches
        var md5 = require("md5");
        if (user.password != md5(req.body.password)) {
            res.json(401, { success: false, message: 'Authentication failed. Wrong password.' });
            return;
        }
        const payload = {
            username: user.username,
            admin: user.admin 
        };
        var token = jwt.sign(payload, config.secret, {
            expiresIn: 60*60*24
        });
        // return the information including token as JSON
        res.setCookie("username", user.username, {maxAge: 60*60*24, path: "/"});
        res.setCookie("token",token,{maxAge: 60*60*24, path: "/"});
        // const userInfo = { user.username, user.email, user.mobilePhone, user.role };
        res.send(200, {
            success: true,
            message: 'Enjoy your token!',
            user: { username: user.username, email: user.email, mobilePhone: user.mobilePhone, role: user.role }
        });
        return next();
    },
    currentUser: async function(req, res, next) {
        //If req.body.username is null, fetch current logined user
        const username = (req.body && req.body.username) ? req.body.username : req.decoded.username;
        if(username != req.decoded.username) {
            //check permission for fetching other's info
            if (!req.decoded.admin)
                return res.json(403, { success: false, message: "No permission to fetch other user!" });
        }
        const user = await config.db.collection("users").findOne({ username });
        if(user) {
            return res.json({ 
                success: true, 
                user: { username: user.username, email: user.email, mobilePhone: user.mobilePhone, role: user.role } 
            });
        } else {
            return res.json(200, { success: false, message: "No user matches " + username });
        }
    },
    patchUser: async function(req, res, next) {
        if(req.body.username != req.decoded.username) {
            //check permission
            if(!req.decoded.admin)
                return res.json(403, { success: false, message: "No permission to update other user!" });
        }
        try{
            const user = req.body;
            const { result } = await config.db.collection("users").updateOne({ username: req.body.username }, { $set: req.body });
            if(result.ok){
                return res.json({ success: true, user });
            } else {
                return res.json(200, { success: false, message: "no user matches for " + req.body.username });
            }
            
        }catch(error){
            return res.json(500, { success: false, message: JSON.stringify(error) });
        }
    },
    changePassword: async function(req, res, next) {
        const username = req.decoded.username;
        const { oldPassword, newPassword, rePassword } = req.body;
        if(newPassword!==rePassword) {
            return res.json(200, { success: false, message: "两次输入密码不一致！" });
        }
        // const username = req.cookie.username;
        const user = await config.db.collection("users").findOne({ username });
        if(md5(oldPassword)!==user.password){
            return res.json(200, { success: false, message: "原始密码有误！" });
        }
        try{
            const {result} = await config.db.collection("users").update({ username },{ $set: { password: md5(newPassword) } });
            if(result.ok){
                return res.json({ success: true });
            } else {
                return res.json(200, { success: false, message: "no user matches for " + username });
            }
        return next();
        } catch(err){

        }
    },
    createUser: async function(req, res, next) {
        var nick = { 
            username: req.query.username,
            password: md5(req.query.password),
            admin: true
        };
        const r = await config.db.collection("users").save(nick);
        res.json({ success: true });
        return next();
    },
}