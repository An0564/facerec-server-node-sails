/**
 * FaceController
 *
 * @module      :: Controller
 * @description	:: A set of functions called `actions`.
 *
 *                 Actions contain code telling Sails how to respond to a certain type of request.
 *                 (i.e. do stuff, then send some JSON, show an HTML page, or redirect to another URL)
 *
 *                 You can configure the blueprint URLs which trigger these actions (`config/controllers.js`)
 *                 and/or override them with custom routes (`config/routes.js`)
 *
 *                 NOTE: The code you write here supports both HTTP and Socket.io automatically.
 *
 * @docs        :: http://sailsjs.org/#!documentation/controllers
 */

var cv = require('opencv'); //opencv bindings
var gm = require('gm'); //graphicsmagick
var fs = require('fs'); //File System
var crypto = require('crypto'); //Used for hashing filename

module.exports = {
    
	//add face to the database and perform training
	add:function(req,res){
		//First check the JSON includes the required fields
		if(req.body.username && req.body.image && req.body.imageformat
			&& req.body.email)
			{				
				username = req.body.username;
				User.findOneByUsername(username)
				.done(function(err, user){
					if(err || !user)
					{
						//If user does not exist
						res.send('Error');
					}
					else
					{
						//If user was found proceed to the next step
						email = req.body.email;
						//Checking if the email exist in the user's people database
						Person.findOne({
							'email':email,
							'UserId':user.id,
						})
						.done(function(err, person){
							if(err || !person)
							{
								//person does not exist
								res.send('Error');
							}
							else
							{
								//This funciton has a callback
								//This function hashes the filename, decode the base64 image, 
								//save the image to the public image directory,	convert and resize the image the pgm,
								//create a face object, and perform training
								addHelper(user, person, req.body.image, req.body.imageformat, function(err){
									if(err)
									{
										res.send('Error');										
									}
									else
									{
										res.send('Success');
									}
								});
							}
						});
					}
				});
			}
		else
		{
			return res.send('Error');
		}
	},
	
	recognize:function(req,res){
		if(req.body.username && req.body.image && req.body.imageformat)
		{
			username = req.body.username.toLowerCase();
			User.findOneByUsername(username)
			.done(function(err, user){
				if(err)
				{
					if(err || !user)
					{
						return res.send('Error');
					}
					else
					{
						//TODO pass in already converted image
						//Decode base64 image, do a for loop for number of faces, etc.
						//
						recognizeHelper(user, req.body.image, req.body.imageformat, function(err, name){
							res.send(name);
						});
					}
				}
			});
			
		}
	},
	

  /**
   * Overrides for the settings in `config/controllers.js`
   * (specific to FaceController)
   */
  _config: {}

  
};


//Initialize FaceRecognizer variables
var eigenFaceRecognizer = cv.FaceRecognizer.createEigenFaceRecognizer();
var fisherFaceRecognizer = cv.FaceRecognizer.createFisherFaceRecognizer();
var lbphFaceRecognizer = cv.FaceRecognizer.createLBPHFaceRecognizer();	

//Predict
function predict(user, pgm_image, callback)
{
	//Find the most recent one
	//TODO check this
	TrainingData.findAllbyUserId(user.id)
	.done(function(err, datum){
		if(err) { return callback(err, null); }
		else
		{
			if(datum.length > 0){
				trainingData = datum[0];
				eigenFaceRecognizer.loadSync(trainingData.EigenFace_paths);
				fisherFaceRecognizer.loadSync(trainingData.FisherFace_path);
				lbphFaceRecognizer.loadSync(trainingData.LBPHFace_path);
				
				cv.readImage(pgm_image, function(err, img){
					if(err) { return callback(err, null); }
					eigR  = eigenFaceRecognizer.predictSync(im).id;
					fishR = fisherFaceRecognizer.predictSync(im).id;
					lbphR = lbphFaceRecognizer.predictSync(im).id;
					
					Person.findOneById(eigR)
					.done(function(err, eperson){
						Person.findOneById(fishR)
						.done(function(err, fperson){
							Person.findOneById(err, lperson)
							.done(function(err, lperson){
								console.log('Eigenface predicted ' + eperson.fullname());
								console.log('Fisherface predicted ' + fperson.fullname());
								console.log('LBPHface predicted ' + lperson.fullname());
								//Majority
								if(eigR == fishR && eigR == lbphR && lbphR == fishR)
								{
									callback(err, fperson.fullname());
									//return fishR
								}
								else if(eigR == fishR)
								{
									callback(err, fperson.fullname());
									//return fishR
								}
								else if(eigR == lbphR)
								{
									callback(err, lperson.fullname());
									//return lbphR
								}
								else if(fishR == lbphR)
								{
									callback(err, fperson.fullname());
									//return fishR;
								}
								else
								{
									callback(err, fperson.fullname());
									//return fishR
								}
							});
						});
					});
					
				});
			}
			else{
				return callback(err, null);
			}
		}
	});
		
}

function recognizeHelper(user, image, imageformat, callback)
{
	err = null;
	//First decode the base64 image
	//Save that image
	//TODO use config
	tmpPath = './.tmp';
	if(!fs.existsSync(tmpPath))
	{
		fs.mkdir(tmpPath);
	}
	filename = hashFilename();
	imageFileLocation = tmpPath + filename + imageformat;
	convertToPGM(imageFileLocation, function(err){
		if(err) { return callback(err, null); }
		else
		{
			predict(user, tmpPath + hashFilename + '.pgm', function(err, name){
				if(err){ callback(err, null); }
				else{ callback(err, name) }
			});
		}
	});
}

//Training Implementation
function trainHelper(faces, user, callback)
{
	console.log('here');
	var trainingData = [];
	for(i = 0; i < faces.length; i++){
		trainingData.push([faces[i].PersonId, faces[i].image_path]);		
		console.log(faces[i].PersonId + ' ' + faces[i].image_path);
	}
	var date = new Date();
	var n = date.toISOString();

	var shasum = crypto.createHash('sha1');
	hash_fname_ei = shasum.update(n+'_e').digest('hex') + '.xml';
	console.log(faceDataDirectory + user.username + '/' + hash_fname_ei);
    eigenFaceRecognizer.trainSync(trainingData);
	console.log('Error here 5');	
    eigenFaceRecognizer.saveSync(faceDataDirectory + user.username + '/' + hash_fname_ei);

	console.log('Error here 1');
	shasum = crypto.createHash('sha1');
	hash_fname_fi = shasum.update(n+'_f').digest('hex') + '.xml';
    fisherFaceRecognizer.trainSync(trainingData);
    fisherFaceRecognizer.saveSync(faceDataDirectory + user.username + '/' + hash_fname_fi);

	console.log('Error here 2');
	shasum = crypto.createHash('sha1');	
	hash_fname_lb = shasum.update(n+'_l').digest('hex') + '.xml';
    lbphFaceRecognizer.trainSync(trainingData);
    lbphFaceRecognizer.saveSync(faceDataDirectory + user.username + '/' + hash_fname_lb);
	
	TrainingData.create({
		EigenFace_path : faceDataDirectory + user.username + '/' + hash_fname_ei,
		FisherFace_path: faceDataDirectory + user.username + '/' + hash_fname_fi,
		LBPHFace_path  : faceDataDirectory + user.username + '/' + hash_fname_lb,
		UserId:user.id
	})
	.done(function(err, trainingdata){
		return callback(err);
	});
}

function train(user, callback)
{
	err = null;
	//Initialize Empty Faces
	faces = [];
	//Check User Group
	if(user.group === 'admin')
	{
		Face.findAll()
		.done(function(err, faces){
			trainHelper(faces, user, function(error){
				if(error){
					err = 'bad';
					return callback(err);
				}
			});	
		});
	}
	else
	{
		//TODO fix this
		//Find by friends.id, user.id, 
		Face.findByUserId(user.id)
		.done(function(err, user, faces){
			trainHelper(faces, function(error){
				if(error){
					err = 'bad';
					return callback(err);
				}
			});
		});
	}
}

//Don't like the @ symbol included in the folder name
function emailToFolderName(m_email)
{
	return m_email.replace('@',"_at_").replace('.','_dot_');
}

//Add Function Helper
//Store Image to System
/*This function will create a face object, decode the base64 image, 
 *save the image, convert to pgm, and perform training.
*/
function addHelper(user, person, base64_image, imageformat, callback)
{
	err = null;
	//Hashing to a unique filename using time
	hashedFileName = hashFilename();
	//Make sure person's folder exist with name.
	personImageFolderPath = './public/images/' + emailToFolderName(person.email);
	//TODO If not create a folder & add config
	if(!fs.existsSync(personImageFolderPath))
	{
		fs.mkdir(personImageFolderPath);
	}
	imageFileNameWithoutExt = hashedFileName; //Improve naming
	imageFileLocation = personImageFolderPath + '/' + imageFileNameWithoutExt; //ImageFileLocation
	
	//Write the image file to the person's folder and decode the image using base64								
	fs.writeFile(imageFileNameWithoutExt + req.body.imageformat, req.body.image, 'base64', function(err){
		if(err){ return callback(err); }
		else
		{
			//TODO the gm argument can change
			//TODO Use opencv to crop the face better and rotate
			//Convert the image to pgm, resize, and save
			convertToPGM(imagepath, imageformat, function(err){
				if(err){ return callback(err); }
				else
				{
					Face.create({
						PersonId:person.id,
						UserId:user.id,
						pgm_path:imageFileNameWithoutExt + '.pgm',
						image_path:ImageFileNameWithoutExt + imageformat,
					})
					.done(function(err, face){
						if(err){ return callback(err); }
						else
						{
							train(user, function(err){
								if(err)
								{
									return callback(err);
								}
								else
								{
									return;
								}
							});
						}
					});
				}
			});
		}
	});
}

//Hashing Filename using date
function hashFilename()
{
	var date = new Date();
	var isoDate = date.toISOString();
	var shasum = crypto.createHash('sha1');
	return shasum.update(isoDate).digest('hex');
}

//Convert image to pgm
function convertToPGM(imagepath, imageformat, callback)
{
	err = null;
	gm(imagepath + imageformat)
	.setFormat('pgm')
	.resize(92, 112, "!")
	.write(imagepath + '.pgm',function(err){
		return callback(err);
	});
}


