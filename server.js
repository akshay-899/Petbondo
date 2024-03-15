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

dotenv.config(); 
var app=express();

app.set('view engine', 'ejs');



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
        // pass:'dumbobad@6969'
        
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
app.get('/',(req,res)=>{
    res.render('index');

});
function fetchPets(category, res) {
    let sql;
    if (category === 'all') {
        sql = "SELECT * FROM pets";
    } else if (category === 'cats') {
        sql = "SELECT * FROM pets WHERE species_id = 2";
    } 
    else if (category === 'dogs') {
        sql = "SELECT * FROM pets WHERE species_id = 1";
    }
    else if(category==='others'){
        sql="SELECT * FROM pets WHERE species_id = 3";
    }
    else {
        return res.status(404).send('Category not found');
    }

    db.query(sql, (err, data) => {
        if (err) throw err;
        else {
            res.render('pets', { category, pets: data });
        }
    });
}
app.get('/pets', (req, res) => {
    fetchPets('all', res);
});
 
app.get('/pets/:category', (req, res) => {
    const category = req.params.category;
    fetchPets(category, res);
});

app.get('/admin',(req,res)=>{
    res.render('admin');
});
app.get('/admin/add_pet', (req, res) => {
    res.render('add_pet');
});
app.get('/admin/applications', (req, res) => {
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
app.get('/success',(req,res)=>{
    res.send(`<html>
    <body style="background-color:black;display:flex;align-items:center;justify-content:center;font-size:21px;color:red">Thank you for adding the pet the pet is added in the database
    </body>
    </html>`);
});


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


// app.post('/admin/approve-adoption/:id', (req, res) => {
//     const adoptionId = req.params.id;

//     const sql = 'UPDATE adopters SET status = "approved" WHERE adopter_id = ?';
//     db.query(sql, [adoptionId], (err, result) => {
//         if (err) {
//             console.error('Error approving adoption request:', err);
//             res.status(500).send('Error approving adoption request');
//         } else {
//             send_approval_email(adoptionId); 
//             res.redirect('/admin/applications'); 
//         }
//     });
// });
app.post('/admin/approve-adoption/:id', (req, res) => {
    const adoptionId = req.params.id;

    // Retrieve the adopter's email and the associated pet_id
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
                // Handle this case appropriately, maybe send a response to the client or log a message.
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



// app.post('/admin/approve-adoption/:id', (req, res) => {
//     const adoptionId = req.params.id;

//     // Retrieve the adopter's email and the associated pet_id
//     const sql = 'SELECT pet_id, email FROM adopters WHERE adopter_id = ?';
//     db.query(sql, [adoptionId], (err, rows) => {
//         if (err) {
//             console.error('Error fetching adoption information:', err);
//             res.status(500).send('Error approving adoption request');
//         } else {
//             const petId = rows[0].pet_id;
//             const userEmail = rows[0].email;

//             // Update adopter's status to "approved"
//             const updateSql = 'UPDATE adopters SET status = "approved" WHERE adopter_id = ?';
//             db.query(updateSql, [adoptionId], (err, result) => {
//                 if (err) {
//                     console.error('Error approving adoption request:', err);
//                     res.status(500).send('Error approving adoption request');
//                 } else {
//                     // Insert adoption record into the adoptions table
//                     const insertSql = 'INSERT INTO adoptions (adopter_id, pet_id, adoption_date) VALUES (?, ?, NOW())';
//                     db.query(insertSql, [adoptionId, petId], (err, result) => {
//                         if (err) {
//                             console.error('Error adding adoption record:', err);
//                             res.status(500).send('Error approving adoption request');
//                         } else {
//                             // Send approval email to the adopter
//                             send_approval_email(userEmail);
//                             res.redirect('/admin/applications');
//                         }
//                     });
//                 }
//             });
//         }
//     });
// });









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




app.listen(3000,(err)=>{
    if(err) console.log(err);
    console.log("Server is running on port 3000");
});