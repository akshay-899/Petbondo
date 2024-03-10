const express=require('express');
const mysql=require('mysql');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bodyParser=require('body-parser');
const ejs=require('ejs');
var app=express();

app.set('view engine', 'ejs');



app.use(bodyParser.urlencoded({extended:true}));
app.use(bodyParser.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/views',express.static(path.join(__dirname,'views')));

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

//database

var db=mysql.createConnection({
    host: 'localhost',
    user:'root',
    password:'',
    database: 'pet_adoption',
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
app.get('/thank-you', (req, res) => {
    res.render('thank-you');
});
app.get('/about',(req,res)=>{
    res.render('about');
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
        res.redirect('/thank-you');

    });
}

});



app.listen(3000,(err)=>{
    if(err) console.log(err);
    console.log("Server is running on port 3000");
});