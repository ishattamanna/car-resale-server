const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();


const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Hello from resale.com server');
});


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.tzinyke.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


function verifyJWT(req, res, next) {

    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'Unauthorized Access' })
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_SECRET, function (error, decoded) {
        if (error) {
            return res.status(403).send({ message: 'Forbiddedn Access' });
        }
        req.decoded = decoded;
        next();
    })

}


async function run() {


    try {


        const categoriesCollection = client.db('carResale').collection('categories');
        const productsCollection = client.db('carResale').collection('products');
        const usersCollection = client.db('carResale').collection('users');
        const bookingsCollection = client.db('carResale').collection('bookings');
        const advertisesCollection = client.db('carResale').collection('advertises');
        const reportsCollection = client.db('carResale').collection('reports');
        const paymentsCollection = client.db('carResale').collection('payments');


        const verifyAdmin = async (req, res, next) => {
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'admin') {
                return res.status(403).send('forbidden Acces');
            }
            next();
        }
        const verifySeller = async (req, res, next) => {
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'Seller') {
                return res.status(403).send('forbidden Acces');
            }
            next();
        }


        app.get('/categories', async (req, res) => {
            const query = {};
            const categories = await categoriesCollection.find(query).toArray();
            res.send(categories);
        });

        app.get('/products', verifyJWT, async (req, res) => {
            let query = {};

            if (req.query.email) {
                const decodedEmail = req.decoded.email;
                if (req.query.email !== decodedEmail) {
                    return res.status(401).send({ message: 'Unauthorized Access' });
                };
                query = { sellerEmail: req.query.email };
            };

            const products = await productsCollection.find(query).toArray();
            res.send(products);
        });

        app.get('/products/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const bookingQuery = { productId: id }
            const isBooked = await bookingsCollection.findOne(bookingQuery);
            if (isBooked) {
                return res.send({ message: 'alreadyBooked' });
            }
            const product = await productsCollection.findOne(query);
            res.send(product);

        });

        app.get('/categoryProducts/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { $and: [{ categoryId: id }, { paid: { $exists: false } }] };
            const products = await productsCollection.find(query).toArray();
            res.send(products);
        });

        app.post('/users', async (req, res) => {
            const user = req.body;

            const query = { email: user.email }
            const alreadyInserted = await usersCollection.findOne(query);
            if (alreadyInserted) {
                return res.send({ message: 'userExists' });
            }
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        app.get('/users', verifyJWT, async (req, res) => {
            let query;
            if (req.query.email) {
                query = { email: req.query.email };
                const user = await usersCollection.findOne(query);
                if (!user) {
                    res.send({ message: 'userNotFound' });
                }
                else {
                    res.send(user);
                }
            }
            else if (req.query.role === 'seller') {
                query = { role: 'Seller' };
                const sellers = await usersCollection.find(query).toArray();
                res.send(sellers);
            }
            else if (req.query.role === 'buyer') {
                query = { role: 'Buyer' };
                const buyers = await usersCollection.find(query).toArray();
                res.send(buyers);
            }
            else if (req.query.role === 'admin') {
                query = { role: 'admin' };
                const admins = await usersCollection.find(query).toArray();
                res.send(admins);
            }
            else {
                query = {};
                const users = await usersCollection.find(query).toArray();
                res.send(users);
            }


        });

        app.put('/users/:id', verifyJWT, async (req, res) => {
            const seller = req.body;
            const id = seller._id;
            const filter = { _id: ObjectId(id) };
            const option = { upsert: true };
            const findingUser = await usersCollection.findOne(filter);

            let updatedDoc
            if (findingUser.isVerified) {
                updatedDoc = {
                    $set: {
                        isVerified: false
                    }
                };
            }
            else {
                updatedDoc = {
                    $set: {
                        isVerified: true
                    }
                };
            }


            const result = await usersCollection.updateOne(filter, updatedDoc, option);
            res.send(result);
        });

        // app.get('/users/:email', async (req, res) => {
        //     const email = req.params.email;
        //     const query = { email: email };
        //     const user = await usersCollection.findOne(query);
        //     res.send(user)
        // })

        app.post('/bookings', verifyJWT, async (req, res) => {
            const booking = req.body;
            const result = await bookingsCollection.insertOne(booking);
            res.send(result);
        });

        app.get('/orders', verifyJWT, async (req, res) => {
            let query = {};

            if (req.query.email) {
                query = { clientEmail: req.query.email }
            }

            const orders = await bookingsCollection.find(query).toArray();
            res.send(orders);
        });

        app.post('/addproduct', verifyJWT, async (req, res) => {
            const product = req.body;
            const date = new Date();
            product.postedTime = date;
            const result = await productsCollection.insertOne(product);
            res.send(result);
        });

        app.delete('/products/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const allDeleteQuery = { productId: id };
            // const isAdvertised = await advertisesCollection.find(isAdvertisedQuery);
            const adverderDeleted = await advertisesCollection.deleteOne(allDeleteQuery);
            const orderDeleted = await bookingsCollection.deleteOne(allDeleteQuery);
            const productDeleted = await productsCollection.deleteOne(query);
            res.send({ productDeleted, adverderDeleted, orderDeleted });
        });

        app.post('/advertisingProducts', verifyJWT, async (req, res) => {
            const product = req.body;
            const date = new Date();
            product.date = date;
            const result = await advertisesCollection.insertOne(product);
            res.send(result);
        });

        app.get('/advertisingProducts', async (req, res) => {
            const query = { paid: { $exists: false } };
            if (req.query.productId) {
                const checkingQuery = { productId: req.query.productId };
                const alreadyAdvertised = await advertisesCollection.findOne(checkingQuery);
                if (alreadyAdvertised) {
                    return res.send({ message: 'adreadyAdvertised' })
                }
            };

            if (req.query.limit) {
                const advertises = await advertisesCollection.find(query).sort({ date: -1 }).limit(3).toArray();
                return res.send(advertises);
            }

            const advertises = await advertisesCollection.find(query).sort({ date: -1 }).toArray();
            res.send(advertises);

        });

        app.delete('/users/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await usersCollection.deleteOne(query);
            res.send(result);
        });

        app.post('/report', verifyJWT, async (req, res) => {
            const reportingProduct = req.body;
            const result = await reportsCollection.insertOne(reportingProduct);
            res.send(result);
        });

        app.get('/reports', verifyJWT, async (req, res) => {
            const query = {};
            const reports = await reportsCollection.find(query).toArray();
            res.send(reports);
        });

        app.post('/create-payment-intent', async (req, res) => {
            const booking = req.body;
            const price = booking.price;
            const amount = price * 100;

            const paymentIntent = await stripe.paymentIntents.create({
                currency: 'usd',
                amount: amount,
                "payment_method_types": [
                    "card"
                ]
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });

        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const result = await paymentsCollection.insertOne(payment);
            const productId = payment.productId;
            const filter = { productId }
            const productFilter = { _id: ObjectId(productId) };
            const updatedDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            }
            const bookingPaid = await bookingsCollection.updateOne(filter, updatedDoc)
            const advertisePaid = await advertisesCollection.updateOne(filter, updatedDoc)
            const productPaid = await productsCollection.updateOne(productFilter, updatedDoc)
            res.send(result);
        });

        app.get('/paidproducts', async (req, res) => {
            const query = {};

            if (req.query.productId) {
                const checkingQuery = { productId: req.query.productId };
                const isPaid = await paymentsCollection.findOne(checkingQuery);
                if (isPaid) {
                    return res.send({ message: 'paid' });
                }
            }

            const paidProducts = await paymentsCollection.find(query).toArray();
            res.send(paidProducts);
        });

        app.delete('/orders/:id', verifyJWT, async (req, res) => {
            const deletingOrderId = req.params.id;
            const query = { _id: ObjectId(deletingOrderId) };
            const result = await bookingsCollection.deleteOne(query);
            res.send(result);
        });

        // app.delete('/allbuyers/:id', async (req, res) => {
        //     const id = req.params.id;
        //     const query = { _id: ObjectId(id) };
        //     const result = await usersCollection.deleteOne(query);
        //     res.send(result);
        // });

        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            console.log(email);
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            if (user) {
                const token = jwt.sign(
                    { email },
                    process.env.ACCESS_SECRET,
                    { expiresIn: '1h' }
                )
                return res.send({ accessToken: token });
            };

            res.status(403).send({ message: 'Unauthorised Access' });

        });
    }
    finally {

    }
}


run().catch(err => console.error(err));


app.listen(port, () => {
    console.log('resale.com is running on port :', port);
});