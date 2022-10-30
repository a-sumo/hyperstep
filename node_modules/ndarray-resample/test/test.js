var resample = require("../resample.js")
var ndarray = require("ndarray")
var fuzz = require("test-fuzzy-array")

require("tape")("resample 1D", function(t) {
  var almostEqual = fuzz(t, 0.000001)
  var array1 = ndarray([3.5])
    , array1Out = ndarray([0])
    , array3 = ndarray([1,2,3])
    , array6Out = ndarray([0,0,0,0,0,0])
    , ref3 = [1,1,2,3,3,2]
    , array4 = ndarray([1,2,3,4])
    , array8Out = ndarray([0,0,0,0,0,0,0,0])
    , ref4 = [1.,1.0857864376269049,2.,2.5,3.,3.914213562373095,4.,2.5]
    , array6 = ndarray([1,2,3,4,5,6])
    , array3Out = ndarray([0,0,0])
    , ref6 = [2.5,2.5,5.5]
    , array8 = ndarray([1,2,3,4,5,6,7,8])
    , array4Out = ndarray([0,0,0,0])
    , ref8 = [3.,2.585786437626905,5.,7.414213562373095]
    , ref83 = [3.5,2.9092297248239727,7.090770275176027]

  resample(array3Out, array1)
  almostEqual(array3Out.data, [3.5,3.5,3.5], "input length: 1, output length: 6, not clamped")

  resample(array1Out, array6)
  almostEqual(array1Out.data, [3.5], "input length: 6, output length: 1, not clamped")

  resample(array3Out, array6)
  almostEqual(array3Out.data, ref6, "input length: 6, output length: 3, not clamped")

  resample(array6Out, array3)
  almostEqual(array6Out.data, ref3, "input length: 3, output length: 6, not clamped")

  resample(array4Out, array8)
  almostEqual(array4Out.data, ref8, "input length: 8, output length: 4, not clamped")

  resample(array8Out, array4)
  almostEqual(array8Out.data, ref4, "input length: 4, output length: 8, not clamped")

  resample(array3Out, array8)
  almostEqual(array3Out.data, ref83, "input length: 8, output length: 3, not clamped")
  
  t.end()
})