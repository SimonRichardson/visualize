(function() {
  'use strict';
  var element = document.getElementById('board'),
      canvas = element.getContext('2d'),
      size = 50,
      scale = 5,
      setup,
      main;

  // Helpers
  function identity(x) {
    return x;
  }

  function compose(f) {
    return function(g) {
      return function(h) {
        return g(f(h));
      };
    };
  }

  function map(as, f) {
    var r = [], i;
    for(i = 0; i < as.length; i++) {
      r.push(f(as[i]));
    }
    return r;
  }

  function filter(as, f) {
    var r = [], i;
    for(i = 0; i < as.length; i++) {
      if(f(as[i])) {
        r.push(as[i]);
      }
    }
    return r;
  }

  function zipWithIndex(as) {
    var r = [], i;
    for(i = 0; i < as.length; i++) {
      r.push([as[i], i]);
    }
    return r;
  }

  function unwrap(as) {
    var r = [], x, y;
    for(x = 0; x < as.length; x++) {
      for(y = 0; y < as[x].length; y++) {
        r.push(as[x][y]); 
      }
    }
    return r;
  }

  function pad2(c) {
    return c.length == 1 ? '0' + c : '' + c;
  }

  function RGB(r, g, b) {
    this.r = r;
    this.g = g;
    this.b = b;
  }
  RGB.prototype.toString = function() {
    var r = Math.round(this.r).toString(16),
        g = Math.round(this.g).toString(16),
        b = Math.round(this.b).toString(16);
    return "#" + pad2(r) + pad2(g) + pad2(b);
  };

  function HSL(h, s, l) {
    this.h = h;
    this.s = s;
    this.l = l;
  }
    
  function brighten(amount, rgb) {
    var x = -(amount / 50),
        r = Math.max(0, Math.min(255, rgb.r - Math.round(255 * x))),
        g = Math.max(0, Math.min(255, rgb.g - Math.round(255 * x))),
        b = Math.max(0, Math.min(255, rgb.b - Math.round(255 * x)));
    return new RGB(r, g, b);
  }
  function darken(amount, rgb) {
    var x = rgbToHsl(rgb),
        y = new HSL(x.h, x.s, Math.min(1, Math.max(0, x.l - (amount / 50))));
    return hslToRgb(y);
  }
  function lighten(amount, rgb) {
    var x = rgbToHsl(rgb),
        y = new HSL(x.h, x.s, Math.max(0, Math.min(1, x.l + (amount / 50))));
    return hslToRgb(y);
  }

  function rgbToHsl(rgb) {
    var r = rgb.r / 255,
        g = rgb.g / 255,
        b = rgb.b / 255,
        max = Math.max(r, g, b), 
        min = Math.min(r, g, b),
        l = (max + min) / 2,
        h, s;

    if(max == min) {
        h = s = 0;
    } else {
        var d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch(max) {
          case r: 
            h = (g - b) / d + (g < b ? 6 : 0); 
            break;
          case g: 
            h = (b - r) / d + 2; 
            break;
          case b: 
            h = (r - g) / d + 4; 
            break;
        }

        h /= 6;
    }
    return new HSL(h, s, l);
  }

  function hslToRgb(hsl) {
    var r, g, b;
    function hue2rgb(p, q, t) {
        if(t < 0) t += 1;
        if(t > 1) t -= 1;
        if(t < 1/6) return p + (q - p) * 6 * t;
        if(t < 1/2) return q;
        if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
    }

    if(hsl.s === 0) {
        r = g = b = hsl.l;
    } else {
        var q = hsl.l < 0.5 ? hsl.l * (1 + hsl.s) : hsl.l + hsl.s - hsl.l * hsl.s,
            p = 2 * hsl.l - q;
        r = hue2rgb(p, q, hsl.h + 1/3);
        g = hue2rgb(p, q, hsl.h);
        b = hue2rgb(p, q, hsl.h - 1/3);
    }

    return new RGB(r * 255, g * 255, b * 255);
  }

   // IO monad
  function IO(unsafePerformIO) {
    this.unsafePerformIO = unsafePerformIO;
  }
  IO.of = function(o) {
    return new IO(function() {
      return o;
    });
  };
  IO.prototype.chain = function(f) {
    var io = this;
    return new IO(function() {
      return f(io.unsafePerformIO()).unsafePerformIO();
    });
  };
  IO.prototype.fork = function() {
    var io = this;
    return new IO(function() {
      setTimeout(function() {
        io.unsafePerformIO();
      }, 1);
    });
  };

  // Logic
  function Pos(x, y) {
    this.x = x;
    this.y = y;
  }

  function Pointer(board, pos) {
    this.board = board;
    this.pos = pos;
  }
  Pointer.prototype.updatePos = function(pos) {
    return new Pointer(this.board, pos);
  };
  Pointer.prototype.extract = function() {
    return this.board[this.pos.x][this.pos.y];
  };
  Pointer.prototype.extend = function(f) {
    var board = [], x, y;
    for(x = 0; x < this.board.length; x++) {
      board[x] = [];
      for(y = 0; y < this.board[x].length; y++) {
        board[x][y] = f(new Pointer(this.board, new Pos(x, y)));
      }
    }
    return new Pointer(board, this.pos);
  };
  Pointer.prototype.singular = function(f) {
    var board = [], 
        x = this.pos.x,
        y = this.pos.y,
        i;
    for(i = 0; i < this.board.length; i++) {
      board[i] = this.board[i].slice();
    }
    board[x][y] = f(new Pointer(this.board, new Pos(x, y)));
    return new Pointer(board, this.pos);
  };

  // Blind stab in the dark.
  function inBounds(pos) {
    // This could actually be a shard boundary
    return pos.x >= 0 && pos.y >= 0 && pos.x < size && pos.y < size;
  }

  function match(pointer, pos) {
    return pos.x == pointer.pos.x && pos.y == pointer.pos.y;
  }

  function predicate(f) {
    return function(s) {
      return f(s);
    };
  }

  function first(s) {
    return s[0];
  }

  function not(s) {
    return !s;
  }

  function pointerNeighbours(pointer) {
    // We should change the offsets instead of breadth search
    var offsets = [new Pos(-1, -1), new Pos(-1, 0), new Pos(-1, 1), new Pos(0, -1), new Pos(0, 1), new Pos(1, -1), new Pos(1, 0), new Pos(1, 1)],
        positions = filter(map(offsets, function(offset) {
          return new Pos(pointer.pos.x + offset.x, pointer.pos.y + offset.y);
        }), inBounds);

    return filter(map(positions, function(pos) {
      return pointer.updatePos(pos).extract();
    }), predicate(not));
  }

  function availableNeighbours(pointer) {
    return filter(pointerNeighbours(pointer), identity);
  }

  function rules(pos) {
    return function(pointer) {
      var c = pointer.extract();
      return c ? c : match(pointer, pos);
    };
  }

  function position(a) {
    var r = a[1] % size,
        c = (a[1] / size) | 0;
    return new Pos(c, r);
  }

  function randomPos(board) {
    var x = zipWithIndex(unwrap(board)),
        y = map(filter(x, compose(first)(not)), position);
    return y[Math.floor(Math.random() * (y.length - 1))];
  }

  function step(board) {
    var p = randomPos(board);
    return new Pointer(board, new Pos(0, 0))
      .extend(rules(p))
      .board;
  }

  setup = new IO(function() {
    element.width = size * scale;
    element.height = size * scale;
    canvas.scale(scale, scale);
  });

  function generateBoard() {
    return new IO(function() {
      var board = [],
          x, y;
      for(x = 0; x < size; x++) {
        board[x] = [];
        for(y = 0; y < size; y++) {
          board[x][y] = false;
        }
      }
      return board;
    });
  }

  function drawBoard(board) {
    return new IO(function() {
      var x, y;
      for(x = 0; x < board.length; x++) {
        for(y = 0; y < board[x].length; y++) {
          var c = board[x][y];
          if(c) {
            canvas.fillStyle = new RGB(238, 238, 0).toString();
            canvas.fillRect(x, y, 1, 1);  
          } else {
            canvas.clearRect(x, y, 1, 1);
          }
        }
      }
    });
  }

  function loop(board) {
    return drawBoard(board).chain(function() {
      return loop(step(board)).fork();
    });
  }

  main = setup.chain(generateBoard).chain(loop);

  // Perform effects!
  main.unsafePerformIO();
})();