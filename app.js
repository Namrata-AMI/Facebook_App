if (process.env.NODE_ENV !== "production") {
    require('dotenv').config();
}

const express = require("express");
const app = express();
const mongoose = require("mongoose");
const path = require("path");
const ejsMate = require("ejs-mate");
const passport = require("passport");
const session = require("express-session");
const FacebookStrategy = require('passport-facebook').Strategy;
const User = require("./models/user.js");
const graph = require('fbgraph'); 


app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.engine("ejs", ejsMate);
app.use(express.static(path.join(__dirname, "public")));

const dbUrl = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/facebook_App";

const sessionOptions = {
    secret: process.env.SECRET || "ourSecret", 
    resave: false,
    saveUninitialized: true,
    cookie: {
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true,
    }
};

// Passport initialization
passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: "http://localhost:8080/auth/facebook/callback",
    profileFields: ['id', 'displayName', 'photos', 'email'] 
}, async function (accessToken, refreshToken, profile, cb) {
    try {
        let user = await User.findOne({ facebookId: profile.id, provider: 'facebook' });
        if (!user) {
            user = await User.create({
                facebookId: profile.id,
                name: profile.displayName,
                provider: profile.provider,
                accessToken: accessToken
            });
        }
        graph.setAccessToken(accessToken);
        graph.get(`${profile.id}/accounts`, async function (err, res) {
            if (err) {
                console.error("Error fetching managed pages:", err);
                return cb(err, null);
            }
            user.managedPages = res.data.map(page => ({
                id: page.id,
                name: page.name
            }));
            await user.save();
            console.log("Managed pages saved:", user.managedPages);
            return cb(null, user);
        });
    } catch (err) {
        console.error("Error", err);
        return cb(err, null);
    }
}));

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (e) {
        done(e, null);
    }
});

// seesion middlewares
app.use(session(sessionOptions));
app.use(passport.initialize());
app.use(passport.session());

// Routes
app.get("/auth/facebook", passport.authenticate('facebook'));

app.get("/auth/facebook/callback", 
    passport.authenticate('facebook', { failureRedirect: '/error' }), 
    function (req, res) {
        res.redirect('/app/show');
    }
);

app.get("/app", (req, res) => {
    res.render("index.ejs");
});

app.get("/app/show", isLoggedIn, (req, res) => {
    res.render("show.ejs", { user: req.user }); 
});

app.post("/submit", isLoggedIn, (req, res) => {
    const pageId = req.body.pageId; 
    const accessToken = req.user.accessToken;

    if (!accessToken || !pageId) {
        console.error("Access token or page ID is missing.");
        return res.status(400).render("err.ejs", { err: "Access denied!" });
    }

    // Proceed with fetching insights using accessToken and pageId
    graph.setAccessToken(accessToken);
    graph.get(`${pageId}/insights?metric=page_fans,page_engaged_users,page_impressions,page_total_actions&period=day`, (err, response) => {
        if (err) {
            console.error("Error fetching page insights:", err);
            return res.status(500).render("err.ejs", { message: "Error fetching page insights" });
        }

        // Process insights data here and render the appropriate view
        const insights = {
            followers: response.data.find(d => d.name === 'page_fans').values[0].value,
            engagement: response.data.find(d => d.name === 'page_engaged_users').values[0].value,
            impressions: response.data.find(d => d.name === 'page_impressions').values[0].value,
            reactions: response.data.find(d => d.name === 'page_total_actions').values[0].value
        };
        res.render('insights.ejs', { insights });
    });
});


// Middleware for checking authentication
function isLoggedIn(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/');
}

//mongodb connect
async function main() {
    try {
        await mongoose.connect(dbUrl);
        console.log("Db connected");
    } catch (err) {
        console.error("Db error:", err);
    }
}

main();

// Handle 404 errors
app.all("*", (req, res, next) => {
    res.status(404).send("Page not found");
});


app.listen(8080, () => {
    console.log("Server is listening on port 8080");
});