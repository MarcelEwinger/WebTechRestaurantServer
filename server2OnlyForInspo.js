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

// helper function, returns a list of products with their tags based on DB query results containing 1 row per product connected to a single tag
// the tag in a row can be null, if the product has zero tags
function getProductWithTags(results) {
	resultRows = results.rows;

	// define an associative array with keys corresponding to product ids and values corresponding to product objects with tag arrays
	let resultMap = [];
	
	// go through all rows 
	for (const row of resultRows) {
		// if there is a product with such id, add the tag to its list of tags, if it defined for this row
		if (resultMap[row.id] != null) {
			if (row.tag != null) { 
				resultMap[row.id].tags.push(row.tag); 
			}
		} else {
			// no product with this id, add it to an associative array with id as a key and with tag array consisting of a single tag if it defined for this row, or as an empty array
			resultMap[row.id] = 
			{ 
				id: row.id, 
				title: row.title, 
				description: row.description, 
				price: row.price, 
				likes_count: row.likes_count, 
				dislikes_count: row.dislikes_count, 
				tags: row.tag != null ? [ row.tag ] : []
			};
		}
	}
	
	let response = Object.values(resultMap); // return complete objects
	return response;
}

// get all products, possibly with a filter specified by means of query parameters ?title=string&description=string&tags=string

app.get("/products", async (req, res) => {
	
	try {

		let selectQuery = "";

		// check if query object has any property
		
		if (! Object.keys(req.query).length) {
			
			// issue unconditional query 
			selectQuery = {
				text: `SELECT products.*, products_tags.tag from products left join products_tags on products.id=products_tags.id`
			};
		
		} else {
			
			// issue the query with a filter
			
			let titleForSearch = "";
			let descriptionForSearch = "";
			let tagForSearch = "";
			
			// form a substring query for a title
			if (req.query.title != null) {
				titleForSearch = req.query.title;
			}
			// form a substring query for a description
			if (req.query.description != null) {
				descriptionForSearch = req.query.description;
			}
			// form a substring query for a tag
			if (req.query.tag != null) {
				tagForSearch = req.query.tag;
			}
			
			selectQuery = {
				text: 
				`SELECT products.*, products_tags.tag from products left join products_tags on products.id=products_tags.id 
				where title like $1 and description like $2 and products.id in (select id from products_tags where tag like $3)`,
				values: [ `%${titleForSearch}%`, `%${descriptionForSearch}%`, `%${tagForSearch}%` ]
			};
		}
		
		let results = await pool.query(selectQuery);
		
		// format a product to include a list of tags and return it as a body
		res.status(200).json(getProductWithTags(results));

    } catch (error) {
        // error accessing db
		res.status(400).json({
			"message": "error occurred"
		});
		console.log(error.stack);
		return;
    }
});

// return products with a price belonging to an interval

app.get("/products/byprice/:start/:end", async (req, res) => {
	
	try {

		// check the intervals
		let end = req.params.end;
		let start = req.params.start;
		if (start > end) {
            res.status(400).json({
                "message": "start of the interval must be smaller than its end"
            });
            return;
		}

		// issue an interval query
		let selectQuery = {
			text: 
			`SELECT products.*, products_tags.tag from products left join products_tags on products.id=products_tags.id 
			where price between $1 and $2`,
			values: [ start, end ]
		};
		
		let results = await pool.query(selectQuery);

		// format a product to include a list of tags and return it as a body
		res.status(200).json(getProductWithTags(results));

    } catch (error) {
        // error accessing db
		res.status(400).json({
			"message": "error occurred"
		});
		console.log(error.stack);
		return;
    }
});

// return products with rating belonging to a specified interval from 0 to 5 (i.e. which have a specified number of stars)

app.get("/products/bystars/:stars", async (req, res) => {
	
	try {

		// check if the stars number is an integer
		let stars = 0;
		if (! RegExp('^\\d+$').test(req.params.stars)) {
           res.status(400).json({
                "message": "stars number is not an integer"
            });
            return;
		} else {
			// convert stars number to an integer value
			stars = parseInt(req.params.stars,10);
			if (stars < 0 || stars > 5) {
			   res.status(400).json({
					"message": "stars number can be from 0 to 5"
				});
				return;
			}
		}

		// if the product has zero likes and zero dislikes, it has zero stars (not rated at all)
		if (stars === 0) {
			let selectQuery = { text: `SELECT products.*, products_tags.tag from products left join products_tags on products.id=products_tags.id where likes_count + dislikes_count = 0` };
			let results = await pool.query(selectQuery);
			res.status(200).json(getProductWithTags(results));
			return;
		}
		
		// define the interval boundaries
		let high = parseFloat(stars) * 0.2;
		let low = parseFloat(stars - 1) * 0.2; 

		// run the interval query
		// we should make sure the intervals do not overlap at edges and zero rating (0 likes, >0 dislikes) belongs to the 1st interval
		
		let formula = `cast(likes_count as float) / cast((likes_count + dislikes_count) as float)`;
		
		let selectQuery = {
			text: 
			`SELECT products.*, products_tags.tag from products left join products_tags on products.id=products_tags.id 
			where likes_count + dislikes_count <> 0 and ((${formula} > $1 and ${formula} <= $2) or (likes_count=0 and $1=0))`,
			values: [ low, high ]
		};
		
		let results = await pool.query(selectQuery);
		
		// format a product to include a list of tags and return it as a body
		res.status(200).json(getProductWithTags(results));

    } catch (error) {
        // error accessing db
		res.status(400).json({
			"message": "error occurred"
		});
		console.log(error.stack);
		return;
    }
});

// get product by id

app.get("/product/:id", async (req, res) => {

	let id = req.params.id;

	try {
	
		// get products with tags, one line per tag-product connection
		let results = await pool.query({ text: `SELECT products.*, products_tags.tag from products left join products_tags on products.id=products_tags.id where products.id=$1`, values: [id] });
		
        resultRows = results.rows;

        // no results
        if (resultRows.length < 1) {
            res.status(404).json({
                "message": "no object with id="+id
            });
            return;
        }

		// format a product to include a list of tags and return it as a body
        res.status(200).json(getProductWithTags(results)[0]);

    } catch (error) {
            res.status(400).json({
                "message": "error occurred"
            });
            console.log(error.stack);
            return;
	}

});

// update a product with a json object containing attributes to be updated

app.put("/product/:id", async (req, res) => {
	
	let id = req.params.id;
	
	if (req.body == null) {
		res.status(400).json({
			"message": "body is empty"
		});
		return;
	}
	
	try {
		
		// get the original values for the attributes

		let results = await pool.query({ text: `SELECT * from products where id=$1`, values: [id] });
		
		let resultRows = results.rows;

			// no results
		if (resultRows.length < 1) {
			res.status(404).json({
				"message": "product with id="+id+" not found"
			});
			return;
		}

		let current = resultRows[0]; // only return one element

		// form the object for update, if the attribute is not specified in the request body, set it to its original value
		let title = req.body.title != null ? req.body.title : current.title;
		let description = req.body.description != null ? req.body.description : current.description;
		let price = req.body.price != null ? req.body.price : current.price;
		let likes_count = req.body.likes_count != null ? req.body.likes_count : current.likes_count;
		let dislikes_count = req.body.dislikes_count != null ? req.body.dislikes_count : current.dislikes_count;
			
		let results2 = await pool.query({
			text: `UPDATE products SET title=$1, description=$2, price=$3, likes_count=$4, dislikes_count=$5 where id=$6`,
			values: [title, description, price, likes_count, dislikes_count, id]
		});

		// results.rowCount: The number of rows processed by the last command
		let affectedRowCount = results2.rowCount;

		// no results
		if (affectedRowCount < 1) {
			res.status(404).json({
				"message": "no changes were applied"
			});
			return;
		}

		// replace tags, if specified

		if (req.body.tags != null) {
			
			await pool.query({ text: `DELETE FROM products_tags where id=$1`, values: [id] });
			
			let results_tags = await pool.query({ text: `select tag FROM tags` });
			
			for (let tag of req.body.tags) {
				
				// we skip non-existent tags, in production error should be probably issued instead
				if (results_tags.rows.find((row) => row.tag === tag) == undefined) {
					console.log(`no tag ${tag} found, insert ignored`);
					continue;
				}
				
				// not efficient, there are bulk insert possibilities e.g. in the node pg package, which can be used instead
				
				await pool.query({
					text: `INSERT INTO products_tags (id, tag) VALUES ($1, $2)`,
					values: [id, tag]
				});
				
			}
			
		}

		res.status(200).json({
				"message": "update successful",
                rowsUpdated: affectedRowCount
		});
		return;


	}	
    catch(error) {
        // error accessing db
            res.status(400).json({
                "message": "error occurred"
            });
            console.log(error.stack);
            return;
    }

});

// add an (existing) tag to a product

app.put("/product/:id/add-tag/:tag", async (req, res) => {
	
	let id = req.params.id;
	let tag = req.params.tag;
	
	try {

		// check if the product exists 
		let results0 = await pool.query({
			text: `SELECT * FROM products WHERE id=$1`,
			values: [id]
		});
		
		if (results0.rows.length === 0) {
            res.status(400).json({
                "message": `object with id=${id} does not exist`
            });
            return;
		}

		// check if the tag exists
		let results_tags = await pool.query({ text: `select tag FROM tags` });
			
		// we issue an error for non-existent tags
		if (results_tags.rows.find((row) => row.tag === tag) == undefined) {
            res.status(400).json({
                "message": `no tag ${tag} exists in a database`
            });
            return;
		}
				
		// check if the tag is already connected to the product
		let results2 = await pool.query({
			text: `SELECT * FROM products_tags WHERE id=$1 AND tag=$2`,
			values: [id, tag]
		});
		
		if (results2.rows.length > 0) {
            res.status(400).json({
                "message": `tag ${tag} already exists for an object with id=${id}`
            });
            return;
		}

		// connect the tag to the product
		await pool.query({
			text: `INSERT INTO products_tags (id, tag) VALUES ($1, $2)`,
			values: [id, tag]
		});
			
		res.status(200).json({
				"message": "tag added successfully"
		});
		return;

	}
    catch(error) {
        // error accessing db
            res.status(400).json({
                "message": "error occurred"
            });
            console.log(error.stack);
            return;
    }

});

// remove a tag from a product

app.put("/product/:id/delete-tag/:tag", async (req, res) => {
	
	let id = req.params.id;
	let tag = req.params.tag;
	
	try {

		// check if the product exists 
		let results0 = await pool.query({
			text: `SELECT * FROM products WHERE id=$1`,
			values: [id]
		});
		
		if (results0.rows.length === 0) {
            res.status(400).json({
                "message": `object with id=${id} does not exist`
            });
            return;
		}


		// check if the tag exists 
		let results_tags = await pool.query({ text: `select tag FROM tags` });
			
		// we issue an error for non-existent tags
		if (results_tags.rows.find((row) => row.tag === tag) == undefined) {
            res.status(400).json({
                "message": `no tag ${tag} exists in a database`
            });
            return;
		}
				
		// check if the tag is already connected to the product
		let results2 = await pool.query({
			text: `SELECT * FROM products_tags WHERE id=$1 AND tag=$2`,
			values: [id, tag]
		});
		
		if (results2.rows.length === 0) {
            res.status(400).json({
                "message": `tag ${tag} does not exist for an object with id=${id}`
            });
            return;
		}

		// remove the connection between the tag and the product
		await pool.query({
			text: `DELETE FROM products_tags WHERE id=$1 AND tag=$2`,
			values: [id, tag]
		});
			
		res.status(200).json({
				"message": "tag deleted successfully"
		});
		return;

	}
    catch(error) {
        // error accessing db
            res.status(400).json({
                "message": "error occurred"
            });
            console.log(error.stack);
            return;
    }

});

// create a new product

app.post("/product", async (req, res) => {
	
	if (req.body == null) {
		res.status(400).json({
			"message": "body is empty"
		});
		return;
	}
	
	try {

		let newProduct = req.body;

		// check if the request body contains an id
		if (newProduct.id == null || newProduct.id === "") {
			res.status(400).json({
				"message": "id must be specified"
			});
			return;
			
		}


		// check if the object with this id already exists
		let resultId = await pool.query({ text: `SELECT id FROM products where id=$1`, values: [newProduct.id]});
		
        let resultIdRows = resultId.rows;

        if (resultIdRows.length > 0) {
            res.status(400).json({
                "message": "object with id="+newProduct.id+" already exists"
            });
            return;
        }
		
		// check if the request body contains a title
		if (newProduct.title == null || newProduct.title === "") {
			res.status(400).json({
				"message": "title must be specified"
			});
			return;
			
		}

		// specify default values for some attributes
		if (newProduct.likes_count == null) newProduct.likes_count = 0;
		if (newProduct.dislikes_count == null) newProduct.dislikes_count = 0;
		if (newProduct.description == null) newProduct.description = "";
		if (newProduct.price == null) newProduct.price = 0;
			
		// add the product
		let results2 = await pool.query({
			text: `INSERT INTO products (id,title,description,price,likes_count,dislikes_count) VALUES($1,$2,$3,$4,$5,$6)`,
			values: [newProduct.id, newProduct.title, newProduct.description, newProduct.price, newProduct.likes_count, newProduct.dislikes_count]
		});

		// results.rowCount: The number of rows processed by the last command.
		let affectedRowCount = results2.rowCount;

		// no results
		if (affectedRowCount < 1) {
			res.status(404).json({
				"message": "no changes were applied"
			});
			return;
		}

		// add tags, if specified

		if (req.body.tags != null) {
			
			let results_tags = await pool.query({ text: `select tag FROM tags` });
			
			for (let tag of req.body.tags) {
				
				// we skip non-existent tags, in production error should be probably issued instead
				if (results_tags.rows.find((row) => row.tag === tag) == undefined) {
					console.log(`no tag ${tag} found, insert ignored`);
					continue;
				}
				
				// not efficient
				await pool.query({
					text: `INSERT INTO products_tags (id, tag) VALUES ($1, $2)`,
					values: [newProduct.id, tag]
				});
				
			}
			
		}

		res.status(201).json({
				"message": "product object created successfully",
                rowsUpdated: affectedRowCount
		});
		return;


	}	
    catch(error) {
        // error accessing db
            res.status(400).json({
                "message": "error occurred"
            });
            console.log(error.stack);
            return;
    }

});

// delete a product 

app.delete("/product/:id", async (req, res) => {
	let id = req.params.id;
	
	try {

		// check if the product exists 
		let results = await pool.query({ text: `SELECT * from products where id=$1`, values: [id] });
		
		let resultRows = results.rows;

		if (resultRows.length < 1) {
			res.status(404).json({
				"message": "no product with id="+id+" found - nothing to delete"
			});
			return;
		}

		// delete connections to tags from this product
		let resd1 = await pool.query({ text: `DELETE from products_tags where id=$1`, values: [id] });
		
		// delete a product
		let resd2 = await pool.query({ text: `DELETE from products where id=$1`, values: [id] });
		
		res.status(200).json({
				"message": "product object deleted successfully",
                rowsDeleted: resd2.rowCount
		});
		return;
	}
    catch(error) {
        // error accessing db
            res.status(400).json({
                "message": "error occurred"
            });
            console.log(error.stack);
            return;
    }
});

// like or dislike a product
  
app.put("/product/:id/:likeordislike", async (req, res) => {
	
	let id = req.params.id;
	let likeOrDislike = req.params.likeordislike;
	
	try {
	
		// specify update query depending on if we are going to like or to dislike
		let query = "";
		if (likeOrDislike === "like") {
			query = {
				text: `UPDATE products SET likes_count=likes_count+1 where id=$1`,
				values: [id]
			};
		} else if (likeOrDislike === "dislike") {
			query = {
				text: `UPDATE products SET dislikes_count=dislikes_count+1 where id=$1`,
				values: [id]
			};
		} else {
			res.status(400).json({
				"message": "either like or dislike must be specified as the second path parameter"
			});
			return;
		}

		// issue an update query
		let results = await pool.query(query);

		affectedRowCount = results.rowCount;

		// if no rows were affected, wrong id was specified
		if (affectedRowCount < 1) {
			res.status(404).json({
				"message": "db entry not found"
			});
			return;
		}

		// everything is ok
		res.status(200).json({
			"message": "update successful",
			rowsUpdated: affectedRowCount
		});
	}
    catch (error) {
            res.status(400).json({
                "message": "error occurred"
            });
            console.log(error.stack);
            return;
	}
});

// create a new tag

app.post("/tag", async (req, res) => {
	
	if (req.body == null) {
		res.status(400).json({
			"message": "body is empty"
		});
		return;
	}
	
	try {

		let newTag = req.body.tag;

		// check if the body contains a tag attribute
		if (newTag == null || newTag === "") {
			res.status(400).json({
				"message": "tag must be specified"
			});
			return;
			
		}


		// check if the tag already exists
		let resultTag = await pool.query({ text: `SELECT * FROM tags where tag=$1`, values: [newTag]});
		
        if (resultTag.rows.length > 0) {
            res.status(400).json({
                "message": "tag "+newTag+" already exists"
            });
            return;
        }

		// add a tag
		let results2 = await pool.query({
			text: `INSERT INTO tags (tag) VALUES($1)`,
			values: [newTag]
		});

		let affectedRowCount = results2.rowCount;

		// no results
		if (affectedRowCount < 1) {
			res.status(404).json({
				"message": "no changes were applied"
			});
			return;
		}

		res.status(200).json({
				"message": "tag "+newTag+" created successfully",
                rowsUpdated: affectedRowCount
		});
		return;


	}	
    catch(error) {
        // error accessing db
            res.status(400).json({
                "message": "error occurred"
            });
            console.log(error.stack);
            return;
    }

});

// delete a tag

app.delete("/tag/:tag", async (req, res) => {
	let tag = req.params.tag;
	
	try {

		// check if the tag exists
		let results = await pool.query({ text: `SELECT * from tags where tag=$1`, values: [tag] });
		
		let resultRows = results.rows;

		if (resultRows.length < 1) {
			res.status(404).json({
				"message": "no tag "+tag+" found - nothing to delete"
			});
			return;
		}
		
		// delete connections to products from this tag
		let resd1 = await pool.query({ text: `DELETE from products_tags where tag=$1`, values: [tag] });
		
		// delete a tag
		let resd2 = await pool.query({ text: `DELETE from tags where tag=$1`, values: [tag] });
		
		res.status(200).json({
				"message": "tag deleted successfully",
                rowsDeleted: resd2.rowCount
		});
		return;
	}
    catch(error) {
        // error accessing db
            res.status(400).json({
                "message": "error occurred"
            });
            console.log(error.stack);
            return;
    }
});

let port = 3000;
app.listen(port);
console.log("Server running at: http://localhost:"+port);
