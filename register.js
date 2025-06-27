import { Router } from "express";
import bcrpyt from "bcrypt";
import { get_user, get_credentials } from "./index.js";
import db from "./db.js";
import { config } from "dotenv"

const reg_router = Router();
config();

reg_router.get("/register", (req, res) => {
    res.render("register.ejs");
});

reg_router.post("/register", async (req, res) => {
    try {
        const { username, password } = await get_credentials(req);
        const data = await get_user(username);

        if (data.length > 0) {
            res.render({error: "User exists, login"});
        } else {
            bcrpyt.hash(password, process.env.SALTROUNDS, async(err, hash) => {
            if (err) { console.error(err.message); } 

            await db.query("INSERT INTO users(email, password) VALUES ($1, $2) RETURNING *", [username, hash]);
            res.redirect("/login");
            });
        }
    } catch(error) {
        console.error(error.message);  
    }
});

export default reg_router;