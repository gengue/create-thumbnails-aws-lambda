// dependencies
var async = require('async');
var AWS = require('aws-sdk');
var gm = require('gm').subClass({ imageMagick: true }); // Enable ImageMagick integration.
var util = require('util');

// constants
var MAX_WIDTH  = 210;
var MAX_HEIGHT = 180;

// get reference to S3 client 
var s3 = new AWS.S3();
 
exports.handler = function(event, context) {
	// Read options from the event.
	console.log("Reading options from event:\n", util.inspect(event, {depth: 5}));
	var srcBucket = event.Records[0].s3.bucket.name;
	// Object key may have spaces or unicode non-ASCII characters.
  var srcKey = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));  
	var dstBucket = srcBucket;

  if (srcKey.slice(-7) == "/tn.jpg" || srcKey.slice(-6) == "/tn.png") {
    return false; 
  }

  tmp = srcKey.split(".");
	var dstKey    = tmp[0]+"/tn."+tmp.pop();

	// Infer the image type.
	var typeMatch = srcKey.match(/\.([^.]*)$/);
	if (!typeMatch) {
		console.error('unable to infer image type for key ' + srcKey);
		return;
	}
	var imageType = typeMatch[1];
	if (imageType != "jpg" && imageType != "png") {
		console.log('skipping non-image ' + srcKey);
		return;
	}

	// Download the image from S3, transform, and upload to a different S3 bucket.
	async.waterfall([
		function download(next) {
			// Download the image from S3 into a buffer.
			s3.getObject({
					Bucket: srcBucket,
					Key: srcKey
				},
				next);
			},
		function transform(response, next) {
      // Retrieve the size of the img
      gm(response.Body).size(function(err, size) {
        cosole.log("el tamaño es: ", size.width, size.height);
        // Calculate the maximum square we can extract
        var square = Math.min(size.width, size.height); 
        var x = (size.width / 2) - (square / 2);
        var y = (size.height / 2) - (square / 2);

        // Extract the middle square and resize to the SIZE defined
        this.crop(square, square, x, y).resize(MAX_WIDTH, MAX_HEIGHT).autoOrient().toBuffer(function(err, buffer) {
          if (err) {
            next(err);
          } else {
            next(null, response.ContentType, buffer);
          }
        });
      });
		},
		function upload(contentType, data, next) {
			// Stream the transformed image to a different S3 bucket.
			s3.putObject({
					Bucket: dstBucket,
					Key: dstKey,
					Body: data,
					ContentType: contentType
				},
				next);
			}
		], function (err) {
			if (err) {
				console.error(
					'Unable to resize ' + srcBucket + '/' + srcKey +
					' and upload to ' + dstBucket + '/' + dstKey +
					' due to an error: ' + err
				);
			} else {
				console.log(
					'Successfully resized ' + srcBucket + '/' + srcKey +
					' and uploaded to ' + dstBucket + '/' + dstKey
				);
			}

			context.done();
		}
	);
};
