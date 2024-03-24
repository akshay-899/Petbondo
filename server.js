const express=require('express');
const mysql=require('mysql');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bodyParser=require('body-parser');
const ejs=require('ejs');
const nodemailer = require('nodemailer');
const { exit } = require('process');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');
const session=require('express-session');

dotenv.config(); 
var app=express();

app.set('view engine', 'ejs');
//session
app.use(session({
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized:true
}));

app.use(bodyParser.urlencoded({extended:true}));
app.use(bodyParser.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/views',express.static(path.join(__dirname,'views')));
app.use('/stylesheets',express.static(path.join(__dirname,'stylesheets')));

//multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const fileName = `${Date.now()}_${file.originalname}`;
        cb(null, fileName);
    },
});
const upload = multer({ storage: storage });

//email service
const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE,
    auth:{
        user:process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
        
    }
});


//database
var db=mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
});

db.connect((err)=>{
    if(!err) console.log("Database Connected!");
    else console.log(err);
    }
);
//routes

//get requests
app.get('/',(req,res)=>{
    res.render('index');

});

function fetchPets(category, res) {
    let sql;
    let speciesCondition = '';

    if (category === 'all') {
        sql = `
            SELECT name, species_id, age, gender, photo
            FROM pets
            WHERE pet_id NOT IN (
                SELECT pet_id
                FROM adoptions
            )
        `;
    } else if (category === 'cats') {
        speciesCondition = 'AND species_id = 2';
    } else if (category === 'dogs') {
        speciesCondition = 'AND species_id = 1';
    } else if (category === 'others') {
        speciesCondition = 'AND species_id = 3';
    } else {
        return res.status(404).send('Category not found');
    }

    sql = `
        SELECT name, species_id, age, gender, photo
        FROM pets
        WHERE pet_id NOT IN (
            SELECT pet_id
            FROM adoptions
        )
        ${speciesCondition}
    `;

    db.query(sql, (err, data) => {
        if (err) {
            console.error('Error fetching pets:', err);
            res.status(500).send('Error fetching pets');
        } else {
            res.render('pets', { category, pets: data });
        }
    });
}
app.get('/pets', (req, res) => {
    const sql = `
    SELECT pet_id,name, species_id, age, gender, photo
    FROM pets
    WHERE pet_id NOT IN (
        SELECT pet_id
        FROM adoptions
    )`;
    db.query(sql, (err, data) => {
        if (err) {
            console.error('Error fetching pets:', err);
            res.status(500).send('Error fetching pets');
        } else {
            res.render('pets', { category: 'all', pets: data });
        }
    });
});
 
app.get('/pets/:category', (req, res) => {
    const category = req.params.category;
    fetchPets(category, res);
});

app.get('/admin_login',(req,res)=>{
    res.render('admin_login');
})
app.get('/admin_signup',(req,res)=>{
    res.render('admin_signup');
});

app.post('/signup', (req, res) => {
    const { name, email, password, phone_number } = req.body;
    const adminId = uuidv4();
    const sql = 'INSERT INTO admin (admin_id, name, email, password,phone_number) VALUES (?,?,?,?,?)';
    
    db.query(sql, [adminId, name, email, password,phone_number], (err, results) => {
        if (err) {
            console.error('Error signing up admin:', err);
            res.status(500).send('Error signing up admin');
        } else {
            // Send email to the admin
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: 'Welcome to Our Website',
                html: `
                    <p>Dear ${name},</p>
                    <p>Thank you for signing up as an admin on our website.</p>
                    <p>Your admin ID: ${adminId}</p>
                    <p>Please keep this information safe and do not share it with anyone!</p>
                `
            };

            transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    console.error('Error sending email:', error);
                    res.status(500).send('Error sending email');
                } else {
                    console.log('Mail was sent to the admin successfully',info.response);
                    res.redirect('/admin_login');
                }
            });
        }
    });
});

app.post('/login', (req, res) => {
    const { adminId, password } = req.body;
    const sql = 'SELECT * FROM admin WHERE admin_id = ? AND password = ?';
    db.query(sql, [adminId, password], (err, results) => {
        if (err) {
            console.error('Error executing query:', err);
            res.status(500).send('Error logging in');
        } else {
            if (results.length > 0) {
                req.session.adminId = results[0].admin_id; // Store admin ID in session
                res.redirect('/admin'); // Redirect to admin
            } else {
                res.send('Invalid admin ID or password');
            }
        }
    });
});

app.get('/admin',requireAdminAuth, (req, res) => {
    // Check if admin is logged in
    if (req.session.adminId) {
        // Render the admin page
        res.render('admin');
    } else {
        res.redirect('/admin_login');
    }
});

// Logout route
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) throw err;
        res.redirect('/admin_login');
    });
});

app.get('/admin/add_pet', requireAdminAuth,(req, res) => {
    res.render('add_pet');
});
app.get('/admin/applications',requireAdminAuth, (req, res) => {
    const sql = 'SELECT * FROM adopters';
    db.query(sql, (err, adopters) => {
        if (err) {
            console.error('Error fetching adoption requests:', err);
            res.status(500).send('Error fetching adoption requests');
        } else {
            res.render('applications', { adopters });
        }
    });
});


app.get('/thank-you', (req, res) => {
    res.render('thank-you');
});

app.get('/about',(req,res)=>{
    res.render('about');
});
app.get('/adoption', (req, res) => {
    const petId = req.query.petId;
    res.render('adoption', {petId: petId });
});
//to display after /add-pet
app.get('/success',(req,res)=>{
    res.send(`<html>
    <body style="background-color:black;display:flex;align-items:center;justify-content:center;font-size:21px;color:red">Thank you for adding the pet.The pet is added in the database
    </body>
    </html>`);
});

app.get('/contact',(req,res)=>{
    res.render('contact');
});


//post requests
app.post('/add-pet', upload.single('photo'), (req, res) => {
    const {name,species_id,age,gender}=req.body;
    const photo = req.file ? req.file.filename : 'default.png';


    var pattern="\d+(\s*(months?|years?))"
    if(req.body.age<0||new RegExp(pattern).test(req.body.age)){
        return res.status(400).send("Invalid age");
        }else{
    const sql = 'INSERT INTO pets (name, species_id, age, gender,photo) VALUES (?, ?, ?, ?, ?)';
    const values = [name, species_id, age, gender, photo];
    db.query(sql,values ,(err,result)=> {
        if(err) throw err;
        res.redirect("/success");
    });
}

});
app.post('/user-adoption/:petId', (req, res) => {
    const { name, contact_number, email } = req.body;
    const petId=req.params.petId;
    const sql = 'INSERT INTO adopters (name, contact_number, email, pet_id) VALUES (?, ?, ?, ?)';
    const values = [name, contact_number, email, petId];
    db.query(sql, values, (err, result) => {
        if (err) {
            throw err;
        }
        res.redirect("/thank-you");
    });
});

//approval
app.post('/admin/approve-adoption/:id', (req, res) => {
    const adoptionId = req.params.id;
    const sql = 'SELECT email, pet_id FROM adopters WHERE adopter_id = ?';
    db.query(sql, [adoptionId], (err, rows) => {
        if (err) {
            console.error('Error fetching adoption information:', err);
            res.status(500).send('Error approving adoption request');
        } else {
            if (rows.length > 0) {
                const userEmail = rows[0].email;
                const petId = rows[0].pet_id;

                // Send approval email to the adopter
                send_approval_email(userEmail, adoptionId, petId, res);
            } else {
                console.error('No rows found for adoption ID:', adoptionId);
                res.status(404).send('No rows found for adoption ID');
            }
        }
    });
});

function send_approval_email(userEmail, adoptionId, petId, res) {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: userEmail,
        subject: 'Your Pet Adoption Application Has Been Approved',
        html: `
            <html>
                <body style="font-family: Arial, sans-serif; color: #333;">
                    <h2>Congratulations, Your Pet Adoption Application Has Been Approved!!!</h2>
                    <p>We are thrilled to inform you that your application for pet adoption has been approved.</p>
                    <p>Thank you for choosing to adopt from us! Your decision will make a positive impact on the life of a pet.</p>
                    <p>You can collect your new pet from our adoption center between 9 am to 5 pm.</p>
                    <p>Please feel free to reach out to us if you have any questions or need assistance with the adoption process.</p>
                    <p>You can explore more of our adorable pets available for adoption on our website.</p>
                    <p>Thank you for considering adoption!</p>
                    <hr>
                    <p style="font-size: 0.8em; color: #666;">This email was sent automatically. Please do not reply.</p>
                </body>
            </html>
        ` 
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Error sending email:', error);
            res.status(500).send('Error sending approval email');
        } else {
            console.log('Email sent:', info.response);
            updateAdoptionStatus(adoptionId, petId, res);
        }
    });
}

function updateAdoptionStatus(adoptionId, petId, res) {
    const updateSql = 'UPDATE adopters SET status = "approved" WHERE adopter_id = ?';
    db.query(updateSql, [adoptionId], (err, result) => {
        if (err) {
            console.error('Error approving adoption request:', err);
            res.status(500).send('Error approving adoption request');
        } else {
            const insertSql = 'INSERT INTO adoptions (adopter_id, pet_id, adoption_date) VALUES (?, ?, NOW())';
            db.query(insertSql, [adoptionId, petId], (err, result) => {
                if (err) {
                    console.error('Error adding adoption record:', err);
                    res.status(500).send('Error adding adoption record');
                } else {
                    res.redirect('/admin/applications');
                }
            });
        }
    });
}


//disapproval
app.post('/admin/disapprove-adoption/:id', (req, res) => {
    const adoptionId = req.params.id;

    const sql = 'UPDATE adopters SET status = "disapproved" WHERE adopter_id = ?';
    db.query(sql, [adoptionId], (err, result) => {
        if (err) {
            console.error('Error approving adoption request:', err);
            res.status(500).send('Error approving adoption request');
        } else {
            send_disapproval_email(adoptionId); 
            res.redirect('/admin/applications'); 
        }
    });
});

function send_disapproval_email(adoptionId) {
    const sql = 'SELECT email FROM adopters WHERE adopter_id = ?';
    db.query(sql, [adoptionId], (err, rows) => {
        if (err) {
            console.error('Error fetching user email:', err);
            exit
        } else {
            const userEmail = rows[0].email;
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: userEmail,
        subject: 'Your Pet Adoption Application has been Disapproved',
        html: `<html>
            <body style="font-family: Arial, sans-serif; color: #333;">
                <h2>Unfortunately, Your Pet Adoption Application Has Been Disapproved</h2>
                <p>We regret to inform you that your application for pet adoption has been disapproved.</p>
                <p>Please don't be discouraged, and feel free to reach out to us if you have any questions or would like further information.</p>
                <p>You can explore more of our adorable pets available for adoption on our website.</p>
                <p>Thank you for considering adoption!</p>
                <hr>
                <p style="font-size: 0.8em; color: #666;">This email was sent automatically. Please do not reply.</p>
            </body>
        </html>`
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Error occurred while sending Email:', error);
        } else {
            console.log('Mail has been sent successfully:', info.response);
        }
    });
}
    });
};

//middleware
function requireAdminAuth(req, res, next) {
    if (req.session && req.session.adminId) {
        next();
    } else {

        res.redirect('/admin_login'); 
    }
}

//listen to the port
app.listen(process.env.PORT||3000,(err)=>{
    if(err) console.log(err);
    console.log(`Server is running at http://localhost:${process.env.PORT}`);
});