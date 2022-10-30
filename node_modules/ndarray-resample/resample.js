"use strict"

var fft = require("ndarray-fft")
var pool = require("ndarray-scratch")
var ops = require("ndarray-ops")
var cwise = require("cwise")

var clampScale = cwise({
  args:["array", "array", "scalar", "scalar", "scalar"],
  body: function clampScale(out, inp, s, l, h) {
    var x = inp * s
    if(x < l) { x = l }
    if(x > h) { x = h }
    out = x
  }
})


function resample(out, inp, clamp_lo, clamp_hi) {
  if(typeof clamp_lo === "undefined") {
    clamp_lo = -Infinity
  }
  if(typeof clamp_hi === "undefined") {
    clamp_hi = Infinity
  }
  
  var ishp = inp.shape
  var oshp = out.shape

  if (inp.shape.length !== out.shape.length) throw new Error("ndarray-resample: input and output arrays should have the same dimensions")
  
  var v, zeroInds = ishp.map(function(){return 0})
  if(out.size === 1) {
    v = ops.sum(inp)/inp.size
    if(v < clamp_lo) { v = clamp_lo }
    if(v > clamp_hi) { v = clamp_hi }
    out.set.apply(out, zeroInds.concat(v))
    return
  } else if (inp.size === 1) {
    v = inp.get.apply(inp, zeroInds)
    if(v < clamp_lo) { v = clamp_lo }
    if(v > clamp_hi) { v = clamp_hi }
    ops.assigns(out, v)
    return
  }

  var d = ishp.length
  var mshp = new Array(d), initToZero = false
  for(var i=0; i<d; i++) {
    mshp[i] = Math.min(oshp[i], ishp[i])
    if (oshp[i] > ishp[i]) initToZero = true // When upsampling, initialize the Fourier components of the output to zero
  }
  
  var x = pool.malloc(ishp)
    , y = pool.malloc(ishp)
  
  ops.assign(x, inp)
  ops.assigns(y, 0.0)

  fft(1, x, y)
  
  var lo = x.lo
    , hi = x.hi
  
  var s = pool.malloc(oshp)
    , t = pool.malloc(oshp)
  if (initToZero) {
    ops.assigns(s, 0.0)
    ops.assigns(t, 0.0)
  }
  
  var nr = new Array(d)
    , a = new Array(d)
    , b = new Array(d)
    , io = new Array(d)
  for(var i=0; i<1<<d; ++i) { // Iterate over the 2^d regions resulting from splitting up the indices in low frequencies above zero and low frequencies below zero (which turn up at the end of the arrays)
    for(var j=0; j<d; ++j) { // Iterate over dimensions to determine correct starting indices and lengths
      if(!(i&(1<<j))) { // Take the positive frequencies for this dimension
        nr[j] = (mshp[j]+1)>>>1 // Take ceil(mshp[j]/2)) low frequencies (for example [0,1] for both mshp[j]==3 and mshp[j]==4)
        a[j] = 0
        b[j] = 0
        io[j] = 0
      } else { // Take the negative frequencies for this dimension
        nr[j] = mshp[j] - ((mshp[j]+1)>>>1) // Take the rest ([-1] for mshp[j]==3, and [-2,-1] for mshp[j]==4)
        if(nr[j] === 0) {
          continue
        }
        a[j] = oshp[j] - nr[j]
        b[j] = ishp[j] - nr[j]
        // If mshp[j] is even, set the first imaginary values (along this dimension) to zero.
        // For example, if mshp[j]==4, 2 and -2 correspond to the same frequency, and should be the average of the amplitudes for 2 and -2.
        // Since the input is real, the Fourier transform has Hermitian symmetry, and we can simply take one or the other and set the corresponding imaginary coefficient(s) to zero.
        // Note that when upsampling, this means that we get a asymmetric response (for example, -2, but not 2 has a non-zero weight), but this does not matter, since the weight is real anyway (again, given Hermitian symmetry).  
        io[j] = (mshp[j]&1) ? 0 : 1
      }
    }
    ops.assign(hi.apply(lo.apply(s, a), nr), hi.apply(lo.apply(x, b), nr))
    ops.assign(lo.apply(hi.apply(lo.apply(t, a), nr), io), lo.apply(hi.apply(lo.apply(y, b), nr), io))
    ops.assigns(hi.apply(hi.apply(lo.apply(t, a), nr), io), 0.0)
  }
  
  fft(-1, s, t)
  clampScale(out, s, out.size/inp.size, clamp_lo, clamp_hi)
  
  pool.free(x)
  pool.free(y)
  pool.free(s)
  pool.free(t)
}

module.exports = resample