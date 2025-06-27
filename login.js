import { Router } from "express";
import  bcrypt from "bcrypt";
import passport from "passport";
import { Strategy } from "passport-local";
import { get_user } from "./index.js";

const log_router = Router();

log_router.get("/login", (req, res) => {
    res.render("login.ejs");
});


passport.use(new Strategy(async function verify(username, password, cb) {
    try {
        const email = await get_user(username);
        if (email.length > 0) {
            const user = email[0];
            const storedHashedPass = user.password;

            bcrypt.compare(password, storedHashedPass, (err, result) => {
                if (err) {
                    return cb(err);
                } else if (result) {
                    return cb(null, user);
                } else {
                    return cb(null, false);
                }
            });
        } else {
            return cb("Error not found");
        }
    } catch(error) {
        console.error(err);
    }
}));

export { log_router };