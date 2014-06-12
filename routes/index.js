module.exports = function(app)  {
  require('./status')(app);
 
  // Request level error handler	 
  app.use(function(err, req, res, next) {
	console.log('Error occurred: ', err);
	res.statusCode = 500;
    res.end("Error occurred, please try again" + '\n');
      
  });


};