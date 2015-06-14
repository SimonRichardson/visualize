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

  function constant(x) {
    return function(y) {
      return x;
    };
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

  function first(s) {
    return s[0];
  }

  function not(s) {
    return !s;
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
    var self = this;
    return new IO(function() {
      requestAnimationFrame(function() {
        self.unsafePerformIO();
      });
    });
  };

  // Writer monad
  function Writer(run) {
    this.run = run;
  }
  Writer.of = function(x) {
    return new Writer(function() {
      return [x, []];
    });
  };
  Writer.prototype.chain = function(f) {
    var self = this;
    return new Writer(function() {
      var result = self.run(),
          t = f(result[0]).run();
      return [t[0], result[1].concat(t[1])];
    });
  };
  Writer.prototype.map = function(f) {
    return this.chain(function(a) {
      return new Writer(function() {
        return [f(a), []];
      });
    });
  };
  Writer.prototype.tell = function(y) {
    var self = this;
    return new Writer(function() {
      return [null, self.run()[1].concat(y)];
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
  Route.prototype.toString = function() {
    return 'Route(' + this.x + ')';
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
  Pos.prototype.toString = function() {
    return 'Pos(route: ' + this.route.toString() + ', offset: ' + this.offset + ')';
  };

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

  function numOfSelectedInQuadrants(tree) {
    var res = [], x, y;
    for(x = 0; x < tree.length; x++) {
      res[x] = [];
      for(y = 0; y < tree[x].length; y++) {
        res[x][y] = filter(tree[x][y], compose(not)(not)).length;
      }
    }
    return res;
  }

  function rankQuadrants(selected) {
    var res = [], x, y, z;
    for(x = 0; x < selected.length; x++) {
      for(y = 0; y < selected[x].length; y++) {
        res.push([new Route([x, y]), selected[x][y]])
      }
    }
    return map(res.sort(function(a, b) {
      return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0;
    }), first);
  }

  function rules(pos) {
    return function(pointer) {
      var c = pointer.extract();
      return c ? c : match(pointer, pos);
    };
  }

  function randomPos(tree) {
    var ranking = rankQuadrants(numOfSelectedInQuadrants(tree)),
        head = ranking[0],
        offset = filter(zipWithIndex(tree[head.x[0]][head.x[1]]), compose(first)(not));
    return new Pos(head, offset[Math.floor(Math.random() * offset.length)][1]);
  }

  function step(tree) {
    return tree.map(function(a) {
      return randomPos(a);
    }).chain(function(p) {
      return tree
            .tell('Random Position: ' + p.toString())
            .chain(function() {
              return tree.map(function(a) {
                var r = new Route([0, 0]),
                    point = new Pointer(new QuadTree(a, r), new Pos(r, 0))
                      .extend(rules(p))
                      .tree
                      .board;
                return point;
              });
            });
    });
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
      return Writer.of(tree);
    });
  }

  function drawTree(tree) {
    return new IO(function() {
      return tree.map(function(a) {
        var d = size / 4, 
            x, y, z, ox, oy;
        for(x = 0; x < a.length; x++) {
          for(y = 0; y < a[x].length; y++) {
            for(z = 0; z < a[x][y].length; z++) {
              ox = (x * d) + (z % d);
              oy = (y * d) + Math.floor(z / d);
              if(a[x][y][z]) {
                canvas.fillStyle = "#eeee00";
                canvas.fillRect(ox, oy, 1, 1);
              } else {
                canvas.clearRect(ox, oy, 1, 1);
              }
            }
          }
        }
        return a;
      });
    });
  }

  function loop(tree) {
    return drawTree(tree).chain(function(x) {
      var result = x.run();
      return loop(step(Writer.of(result[0]))).fork();
    });
  }

  setup = new IO(function() {
    element.width = size * scale;
    element.height = size * scale;
    canvas.scale(scale, scale);
  });

  main = setup.chain(generateTree).chain(loop);

  // Perform effects!
  main.unsafePerformIO();
})();