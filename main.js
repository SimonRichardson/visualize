(function() {
  'use strict';
  var element = document.getElementById('board'),
      canvas = element.getContext('2d'),
      size = 64,
      scale = 5,
      shardSize = Math.floor((size * size) / (4 * 4)),
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

  function inc(x) {
    return x + 1;
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
  function Route(x) {
    this.x = x;
  }
  Route.prototype.equals = function(x) {
    var i;
    for(i = 0; i < this.x.length; i++) {
      if(this.x[i] !== x.x[i]) {
        return false;
      }
    }
    return true;
  };

  function QuadTree(board, route) {
    this.board = board;
    this.route = route;
  }
  QuadTree.prototype.depth = function() {
    var rec = function(board, index) {
      return !Array.isArray(board) ? index : rec(board[0], index + 1);
    };
    return rec(this.board, 0);
  }
  QuadTree.prototype.updateRoute = function(route) {
    return new QuadTree(this.board, route);
  };
  QuadTree.prototype.extract = function() {
    var select = function(x, y, z) {
      return z == 1 ? x[y[0]] : select(x[y[0]], y.slice(1), z - 1);
    };
    return select(this.board, this.route.x, this.depth() - 1);
  };
  QuadTree.prototype.extend = function(f) {
    var self = this,
        rec = function(board, crumb, index) {
          var res = [], route, i;
          for(i = 0; i < board.length; i++) {
            if(index == 1) {
              res[i] = f(new QuadTree(self.board, new Route(crumb.concat([i]))));
            } else {
              res[i] = rec(board[i], crumb.concat([i]), index - 1);
            }
          }
          return res;
        };
    return new QuadTree(rec(this.board, [], this.depth() - 1), this.route);
  };

  function Pos(route, offset) {
    this.route = route;
    this.offset = offset;
  }

  function Pointer(tree, pos) {
    this.tree = tree;
    this.pos = pos;
  }
  Pointer.prototype.updatePos = function(pos) {
    return new Pointer(this.tree, pos);
  };
  Pointer.prototype.extract = function() {
    return this.tree.updateRoute(this.pos.route).extract()[this.pos.offset];
  };
  Pointer.prototype.extend = function(f) {
    var self = this,
        tree = this.tree.extend(function(x) {
          var tree = [],
              row = x.extract(),
              i;
          for(i = 0; i < row.length; i++) {
            tree[i] = f(new Pointer(self.tree, new Pos(x.route, i)));
          }
          return tree;
        });
    return new Pointer(tree, this.pos);
  };

  // Blind stab in the dark.
  function inBounds(pos) {
    // This could actually be a shard boundary
    return pos.x >= 0 && pos.y >= 0 && pos.x < size && pos.y < size;
  }

  function match(pointer, pos) {
    return pos.route.equals(pointer.pos.route) && pos.offset == pointer.pos.offset;
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

  function randomPos(tree) {
    var x = [
          Math.floor(Math.random() * 4),
          Math.floor(Math.random() * 4)
        ],
        y = Math.floor(Math.random() * shardSize);
    return new Pos(new Route(x), y);
  }

  function step(tree) {
    var p = randomPos(tree),
        r = new Route([0, 0]);
    return new Pointer(new QuadTree(tree, r), new Pos(r, 0))
      .extend(rules(p))
      .tree
      .board;
  }

  setup = new IO(function() {
    element.width = size * scale;
    element.height = size * scale;
    canvas.scale(scale, scale);
  });

  function flattenTree(tree) {
    var r = [], x, y;
    for(x = 0; x < tree.length; x++) {
      for(y = 0; y < tree[x].length; y++) {
        r = r.concat(tree[x][y]); 
      }
    }
    return r;
  }

  function generateTree() {
    return new IO(function() {
      var tree = [],
          x, y, z;
      for(x = 0; x < 4; x++) {
        tree[x] = [];
        for(y = 0; y < 4; y++) {
          tree[x][y] = [];
          for(z = 0; z < shardSize; z++) {
            tree[x][y][z] = false;
          }
        }
      }
      return tree;
    });
  }

  function drawTree(tree) {
    return new IO(function() {
      var i, x, y;
      for(i = 0; i < tree.length; i++) {
        var x = i % size,
            y = Math.floor(i / size);
        if(tree[i]) {
          canvas.fillStyle = new RGB(238, 238, 0).toString();
          canvas.fillRect(x, y, 1, 1);
        } else {
          canvas.clearRect(x, y, 1, 1);
        }
      }
    });
  }

  function loop(tree) {
    return drawTree(flattenTree(tree)).chain(function() {
      return loop(step(tree)).fork();
    });
  }

  main = setup.chain(generateTree).chain(loop);

  // Perform effects!
  main.unsafePerformIO();
})();