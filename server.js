const { Pool } = require('pg');

let cfg = require('./config.json')

let express = require('express');
let cors = require('cors')
const app = express();
app.use(express.static('public')); // host public folder
app.use(cors()); // allow all origins -> Access-Control-Allow-Origin: *

const pool = require('./pool.js');

let bodyParser = require('body-parser');
app.use(bodyParser.json()); // support json encoded bodies

app.get("/", (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send("EX3: This is a simple database-backed application");
});



// get all products
app.get("/products", (req, res) => {
    // TODO: write your code here to get the list of products from the DB pool
    pool.loadProducts()
        .then(dbResult => {
         res.send(dbResult.rows);
		 console.log(dbResult.rows)
        })
        .catch(error => {
            console.log(`Error while trying to read from db: ${error}`);
            res.contentType("text/html");
            res.status(400).send("ErrorPage not found on the server")
        });
    });

	//Top Seller
	//Write Reviews
	//like
	//dislike
	



let port = 3000;
app.listen(port);
console.log("Server running at: http://localhost:"+port);
