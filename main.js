(function() {
  'use strict';
  var element = document.getElementById('board'),
      canvas = element.getContext('2d'),
      size = 64,
      scale = 5,
      shardSize = Math.floor((size * size) / (4 * 4)),
      treeLens,
      nodesLens,
      heuristicsLens,
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
        return f(g(h));
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

  // Store
  function Store(set, get) {
    this.set = set;
    this.get = get;
  }
  Store.prototype.extract = function() {
    return this.set(this.get());
  };
  Store.prototype.extend = function(f) {
    var self = this;
    return new Store(
      function(k) {
        return f(new Store(
          self.set,
          function() {
            return k;
          }
        ));
      },
      self.get
    );
  };
  Store.prototype.map = function(f) {
    return this.extend(function(c) {
      return f(c.extract());
    });
  };

  // Lens
  function Lens(run) {
    this.run = run;
  }
  Lens.id = function() {
    return new Lens(function(target) {
      return new Store(
        identity,
        constant(target)
      );
    });
  };
  Lens.arrayLens = function(index) {
    return new Lens(function(a) {
      return new Store(
        function(s) {
          var r = a.slice();
          r[index] = s;
          return r;
        },
        function() {
          return a[index];
        }
      );
    });
  };
  Lens.objectLens = function(property) {
    return new Lens(function(o) {
      return new Store(
        function(s) {
          var r = {},
              k;
          for(k in o) {
            r[k] = o[k];
          }
          r[property] = s;
          return r;
        },
        function() {
          return o[property];
        }
      );
    });
  };
  Lens.prototype.compose = function(b) {
    var a = this;
    return new Lens(function(target) {
      var c = b.run(target),
          d = a.run(c.get());
      return new Store(
        compose(c.set)(d.set),
        d.get
      );
    });
  };
  Lens.prototype.andThen = function(b) {
    return b.compose(this);
  };
  
  // Logic
  function Heuristics(tree, heuristics, route) {
    this.tree = tree;
    this.heuristics = heuristics;
    this.route = route;
  }

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

  function rankQuadrants(selected) {
    var ordering = function(a, b) {
          var x = a[0].probability,
              y = b[0].probability;
          return x < y ? 1 : x > y ? -1 : 0;
        },
        fst = zipWithIndex(selected).sort(ordering),
        snd = zipWithIndex(selected[fst[0][1]].nodes).sort(ordering);

    return [fst[0][1], snd[0][1]];
  }

  function rules(pos) {
    return function(pointer) {
      var c = pointer.extract();
      return c ? c : match(pointer, pos);
    };
  }

  function rank(data) {
    var ranking = rankQuadrants(data.heuristics),
        route = new Route(ranking),
        offset = filter(zipWithIndex(data.tree[ranking[0]][ranking[1]]), compose(not)(first));
    return new Pos(route, offset[Math.floor(Math.random() * offset.length)][1]);
  }

  function step(tree) {
    return tree.map(function(a) {
      return [a, rank(a)];
    }).chain(function(p) {
      var heuristics = p[0],
          rnd = p[1];

      return Writer.of(null)
            .tell('Selected: ' + rnd.toString())
            .chain(function() {
              return Writer.of(heuristics.tree).map(function(a) {
                var r = new Route([0, 0]),
                    point = new Pointer(new QuadTree(a, r), new Pos(r, 0))
                      .extend(rules(rnd))
                      .tree
                      .board;
                return new Heuristics(point, heuristics.heuristics, rnd);
              });
            });
    });
  }

  function updateHeuristics(data) {
    var pos = data.route,
        route = pos.route.x,
        fstLens = Lens.arrayLens(route[0]),
        sndLens = Lens.arrayLens(route[1]),

        modify = function(x, f) {
          return x.set(f(x.get()));
        },
        store = modify(fstLens.run(data.heuristics), function(x) {
          return {
            available: x.available - 1,
            probability: (x.available - 1) / (shardSize * 4),
            nodes: x.nodes
          };
        }),
        heuristics = modify(fstLens.andThen(nodesLens).andThen(sndLens).run(store), function(x) {
          return {
            available: x.available - 1,
            probability: (x.available / shardSize)
          };
        });

    return heuristicsLens.run(data).set(heuristics);
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

  function generateHeuristics(tree) {
    return new IO(function() {
      return tree.map(function(a) {
        var pos = new Pos(new Route([0, 0]), 0),
            heuristics = [],
            x, y;
        for(x = 0; x < a.length; x++) {
          heuristics[x] = {
            available: a[x][0].length * a[x].length,
            probability: 1,
            nodes: []
          };
          for(y = 0; y < a[x].length; y++) {
            heuristics[x].nodes[y] = {
              available: a[x][0].length,
              probability: 1
            };
          }
        }
        return new Heuristics(a, heuristics, pos);
      });
    });
  }

  function drawTree(tree) {
    return new IO(function() {
      stats.end();
      stats.begin();
      return tree.map(function(a) {
        var tree = a.tree,
            d = size / 4, 
            x, y, z, ox, oy;
        for(x = 0; x < tree.length; x++) {
          for(y = 0; y < tree[x].length; y++) {
            for(z = 0; z < tree[x][y].length; z++) {
              ox = (x * d) + (z % d);
              oy = (y * d) + Math.floor(z / d);
              if(tree[x][y][z]) {
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
      var result = x.run(),
          heuristics = updateHeuristics(result[0]);
      return loop(step(Writer.of(heuristics))).fork();
    });
  }

  treeLens = Lens.objectLens('tree');
  nodesLens = Lens.objectLens('nodes');
  heuristicsLens = Lens.objectLens('heuristics');

  setup = new IO(function() {
    element.width = size * scale;
    element.height = size * scale;
    canvas.scale(scale, scale);
    stats.begin();
  });

  main = setup
        .chain(generateTree)
        .chain(generateHeuristics)
        .chain(loop);

  // Perform effects!
  main.unsafePerformIO();
})();