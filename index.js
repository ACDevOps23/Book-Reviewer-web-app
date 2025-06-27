import express from "express";
import bodyParser from "body-parser";
import { body, validationResult } from 'express-validator';
import axios from "axios";
import db from "./db.js";
import passport from "passport";
import session from "express-session";
import crypto from "crypto";
import reg_router from "./register.js";
import { log_router } from "./login.js";
import helmet from "helmet";
import { config } from "dotenv";

const app = express();


app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static("public"));     
app.use(helmet());

config();

const hash = crypto.createHmac("sha256", process.env.SECRET)
                    .update(process.env.SECRETPASSCODE)
                    .digest("hex");

app.use(session({
    secret: hash,
    resave: false,
    saveUninitialized: true,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24, // 1 day
        secure: true,
        httpOnly: false
    }
}));

app.use(passport.initialize());
app.use(passport.session());

const book_api = process.env.BOOKAPI;

async function get_credentials(req) { 
    return { username: req.body.username, password: req.body.password }; 
  }

  async function get_user(username) {
    const user = await db.query("SELECT * FROM users WHERE email = $1", [username]);
    let user_data = user.rows;
    return user_data;
}  

async function get_authors(book) {
    const data = await db.query("SELECT id FROM author WHERE name = $1", [book.author[0]]);

    let author_id;

    if (data.rows.length > 0) {
        author_id = data.rows[0].id;
    } else {
       const author = await db.query("INSERT INTO author(name) VALUES ($1) RETURNING id;", [book.author[0]]);
       author_id = author.rows[0].id;
    }

    return author_id;
}

async function get_review(id) {
    const data = await db.query("SELECT review FROM review WHERE book_id = $1", [id]);
    const response = data.rows;
    return response;
}

async function get_book(isbn) {
    var book_details = {};
    const books = await axios.get(`${book_api}q=isbn:${isbn}`);
    const book = books.data;
    const book_info = book.items[0].volumeInfo;

    book_details.title = book_info.title;
    book_details.isbn = isbn;
    book_details.author = book_info.authors;
    book_details.date = book_info.publishedDate;
    book_details.description = book_info.description;
    book_details.rating = book_info.averageRating;
    book_details.image = book_info.imageLinks.thumbnail;
        
    return book_details;
} 

async function books(id) {
    const novel = await db.query("SELECT book.id, book.author_id, book.title, book.isbn, book.description, book.image_url, book.rating, book.date, review, name AS author_name FROM book LEFT JOIN review on review.book_id = book.id JOIN author ON author.id = book.author_id  WHERE book.id = $1", [id]);
    const response = novel.rows;
    return response;
}

function isAuthenticated(req, res, next) {
    if (!req.isAuthenticated()) {
        return res.redirect('/login');
    } 
        next();
}

app.get("/", isAuthenticated, async (req, res) => {
        try {
            const data = await db.query("SELECT * FROM book");
            const book = data.rows;

            res.render("index.ejs", {books: book});
        } catch(error) { console.error(error.message); }
});

app.use(reg_router);   
app.use(log_router);

// Middleware to validate input
const validateLogin = [
    body('username')
      .isEmail().withMessage('Please provide a valid email address')
      .normalizeEmail(),
    body('password')
      .isLength({ min: 6 }).withMessage('invalid password')
  ];

// Middleware to handle validation errors
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array(), errorFlag: true });
    }
    next();
  };

app.post("/login", validateLogin, handleValidationErrors, passport.authenticate("local", {
    successRedirect: "/",
    failureRedirect: "/login"
}));

app.post("/logout", isAuthenticated, (req, res) => {
        req.logout(function(err) {
            if (err) {
                console.error(err);
                console.log(req.session.cookie);
            }
            req.session.destroy((err) => {
                if (err) {
                    console.error("Error destroying session: ", err);
                }

                res.clearCookie("connect.sid", {
                    path: '/',
                    httpOnly: true,
                    secure: false
                });
                res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
                res.setHeader("Pragma", "no-cache");
                res.setHeader("Expires", "0");
                res.redirect("/login");
            });
        });
});


passport.serializeUser((user, cb) => {
    cb(null, user);
});

passport.deserializeUser((user, cb) => {
    cb(null, user);
});

app.route("/new", isAuthenticated) 
    .get(async (req, res) => {  
        res.render("new_book.ejs"); 
    })

     .post([
         body('isbn')
             .trim()
             .notEmpty().withMessage("ISBN is required.")
             .isLength({min: 10, max: 13}).withMessage("ISBN must be 10 or 13 characters long.")
             .matches(/^(?=(?:[^0-9]*[0-9]){10}(?:(?:[^0-9]*[0-9]){3})?$)[\d-]+$/).withMessage('Invalid ISBN format.')], 
        async (req, res) => { 
        const errors = validationResult(req);
        
        if (!errors.isEmpty()) {
            return res.render("new_book.ejs", {errors: errors.array(), errorFlag: true});
        }
        var isbn = req.body.isbn;

       try {
            var book = await get_book(isbn);
            var author_id = await get_authors(book);
            console.log(book);
            console.log(author_id);
         
            await db.query("INSERT INTO book(title, isbn, description, date, image_url, rating, author_id) VALUES ($1, $2, $3, $4, $5, $6, $7)", [
                book.title, book.isbn, book.description, book.date, book.image, book.rating, author_id]);
        
            } catch (error) { 
                return res.render("new_book.ejs", {errors: [{msg: "Not a vaid ISBN, try again."}], errorFlag: true});
            }
       res.redirect("/");
    });

app.get("/book/:id", isAuthenticated, async (req, res) => {
    const id = parseInt(req.params.id);
    try {
        const book = await books(id);
        const reviews = await get_review(id);
        res.render("book_details.ejs", { book: book[0], reviews: reviews});
    } catch (error) {console.error(error.message); }
});
 
app.post("/review/:id", isAuthenticated, async (req, res) => {
    const book_id = parseInt(req.params.id);
    const review = req.body.review_text;
    try {
        await db.query("INSERT INTO review(review, book_id) VALUES ($1, $2)", [review, book_id]);
    } catch(error) { console.error(error.message); }
    res.redirect("/book/"+book_id);
});

app.post("/book/:id", isAuthenticated, async (req, res) => { // delete
    const id = parseInt(req.params.id);
    try {
        await db.query("DELETE FROM review WHERE book_id = $1", [id]);
        await db.query("DELETE FROM book WHERE id = $1", [id]);
    } catch(error) { console.error(error.message); }
    res.redirect("/");
});


app.listen(process.env.INDEX_PORT, async () => { console.log("server on..."); await db.connect() });

export { get_user, get_credentials } 
