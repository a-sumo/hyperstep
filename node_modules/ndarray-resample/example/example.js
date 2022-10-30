var baboon = require("luminance")(require("baboon-image"))
var x = require("zeros")([256,256])
require("../resample.js")(x, baboon)
require("save-pixels")(x, "png").pipe(process.stdout)