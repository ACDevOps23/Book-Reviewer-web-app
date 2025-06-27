import pg from "pg";
import { config } from "dotenv";

config();

const db = new pg.Client({
        host: process.env.HOST,
        user: process.env.USER,
        database: process.env.DATABASE,
        password: process.env.PASSWORD,
        port: process.env.PORT,
    ssl: {
        rejectUnauthorized: true
    }
});

db.connect()
    .then(() => console.log("db connected"))
    .catch(err => console.error("db error", err.stack));

export default db;     