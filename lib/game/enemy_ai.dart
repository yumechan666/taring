part of 'simulation.dart';

extension EnemyAI on JourneySimulation {
  void enemyAnimation(
    Enemy e,
    String name,
    double dt, {
    double progress = -1,
    double fps = 8,
  }) {
    e.animTime = e.animation == name ? e.animTime + dt : 0;
    e.animation = name;
    e.animProgress = progress;
    e.animFps = fps;
  }

  void addShot(
    String kind,
    double x,
    double y,
    double vx,
    double vy, {
    Json extra = const {},
  }) {
    shots.add({
      'kind': kind,
      'x': x,
      'y': y,
      'vx': vx,
      'vy': vy,
      't': 0.0,
      'friendly': false,
      'ids': <String>{},
      ...extra,
    });
  }

  void frontHit(Enemy e, double reach, double height, {double back = 0}) {
    if (player.overlaps(
      e.x + e.facing * (reach - back) / 2,
      e.y - height / 2,
      reach + back,
      height,
    )) {
      damage(1, e.x);
      player.slowTime = math.max(
        player.slowTime,
        number(e.definition['slowOnHit']),
      );
    }
  }

  bool groundAhead(Enemy e) {
    final x = (e.x + e.facing * (e.w / 2 + .2)).floor();
    return !solid(x, (e.y - .5).floor()) && tile(x, (e.y + .1).floor()) != 0;
  }

  void killEnemy(Enemy e) {
    if (e.memory['killed'] == true) return;
    e.memory['killed'] = true;
    e.hp = 0;
    e.deathTime = 0;
    score += 100;
    kills++;
    if (player.thread?['id'] == e.id) player.thread = null;
    orbs.add({
      'x': e.x,
      'y': e.y - e.h * .6,
      'vx': (kills % 3 - 1) * 2.5,
      'vy': -6.0,
      't': 0.0,
    });
    if (buffs['lifesteal'] == true && kills % 4 == 0 && !player.dead)
      player.hp = math.min(player.maxHp, player.hp + 1);
    sound?.call('enemy_die');
  }

  void updateEnemies(double dt) {
    final p = player;
    for (final e in enemies.toList()) {
      if (e.dead) {
        e.deathTime += dt;
        if (!e.fly) {
          e.vy = math.min(e.vy + 38 * dt, 20);
          e.vx *= .9;
          moveActor(e, dt);
        } else {
          e.vy = math.min(e.vy + 19 * dt, 12);
          e.y += e.vy * dt;
        }
        enemyAnimation(
          e,
          'hurt',
          dt,
          progress: clamp(e.deathTime / .5, 0, .99),
        );
        continue;
      }
      final dx = p.x - e.x, dist = dx.abs(), m = e.memory;
      if (dist > 24 && m['carrying'] != true) continue;
      e.marked = math.max(0, e.marked - dt);
      e.stun = math.max(0, e.stun - dt);
      e.cooldown -= dt;
      e.timer += dt;
      if (e.burn > 0) {
        e.burn -= dt;
        e.hp -= .8 * dt;
        if (e.dead) {
          killEnemy(e);
          continue;
        }
      }
      if (e.frozen > 0) {
        e.frozen -= dt;
        e.vx = 0;
        if (!e.fly) {
          e.vy = math.min(e.vy + 38 * dt, 20);
          moveActor(e, dt);
        }
        continue;
      }
      final stunned = e.stun > 0;
      void anim(String name, {double progress = -1, double fps = 8}) =>
          enemyAnimation(e, name, dt, progress: progress, fps: fps);
      double prog(double dur) => clamp(e.timer / dur, 0, .999);
      switch (e.type) {
        case 'archer':
          if (stunned) {
            e.state = 'idle';
            anim('hurt', progress: .3);
            break;
          }
          if (dist < 13) e.facing = direction(dx);
          if (e.state == 'shoot') {
            anim('shoot', progress: prog(.75));
            final burst = number(e.definition['burst'], 1).toInt(),
                speed = number(e.definition['shotSpeed'], 11),
                fired = number(m['shots']).toInt();
            if (e.timer >= .45 + fired * .13 && fired < burst) {
              m['shots'] = fired + 1;
              final y = e.y - 1.15,
                  flight = math.max(.3, dist / speed),
                  vy = clamp((p.y - .9 - y) / flight, -3, 3),
                  fan = number(e.definition['fan'], 1).toInt();
              for (var i = 0; i < fan; i++) {
                addShot(
                  'arrow',
                  e.x + e.facing * .6,
                  y,
                  e.facing * speed,
                  vy + (i - (fan - 1) / 2) * 2.4,
                  extra: {
                    'slow': number(e.definition['slowOnHit']),
                    'owner': e.id,
                  },
                );
              }
              sound?.call('arrow');
            }
            if (e.timer >= .75 + burst * .13) {
              e.state = 'idle';
              m['shots'] = 0;
              e.cooldown =
                  number(e.definition['interval'], tweak('archerInterval')) *
                  (.8 + random.nextDouble() * .4);
            }
          } else {
            anim('idle', fps: 6);
            if (e.cooldown <= 0 &&
                dist < 11 &&
                (p.y - e.y).abs() < 6 &&
                !p.dead) {
              e.state = 'shoot';
              e.timer = 0;
              m['shots'] = 0;
            }
          }
          e.vx *= .8;
        case 'lantern':
          if (stunned) {
            anim('hurt', progress: .25);
            e.state = 'walk';
            break;
          }
          if (e.state == 'swing') {
            anim('swing', progress: prog(.8));
            if (e.timer > .35 && e.timer < .55) frontHit(e, 1.7, 1.8);
            if (e.timer >= .8) {
              e.state = 'walk';
              e.cooldown = 1.2;
            }
            e.vx *= .8;
            break;
          }
          final sees =
              dist < 7 && direction(dx) == e.facing && (p.y - e.y).abs() < 3;
          if (sees || (dist < 3 && (p.y - e.y).abs() < 2)) {
            e.facing = direction(dx);
            e.vx = e.facing * 2.2;
            if (dist < 1.7 && e.cooldown <= 0) {
              e.state = 'swing';
              e.timer = 0;
            }
          } else {
            final range = number(m['range'], 3);
            if (e.x > e.homeX + range) e.facing = -1;
            if (e.x < e.homeX - range) e.facing = 1;
            e.vx = e.facing * 1.3;
          }
          if (!groundAhead(e)) {
            e.facing *= -1;
            e.vx = 0;
          }
          anim('walk', fps: e.vx.abs() > 2 ? 9 : 6);
        case 'knight':
          if (stunned) {
            anim('hurt', progress: .2);
            e.vx *= .85;
            break;
          }
          if (e.state == 'bash') {
            anim('bash', progress: prog(.9));
            if (e.timer > .35 && e.timer < .55) {
              e.vx = e.facing * 6;
              frontHit(e, 1.4, 1.9);
            } else {
              e.vx *= .8;
            }
            if (e.timer >= .9) {
              e.state = 'walk';
              e.cooldown = 1.6;
            }
            break;
          }
          if (direction(dx) != e.facing && dist < 10) {
            m['turn'] = number(m['turn']) + dt;
            if (number(m['turn']) > .9) {
              e.facing *= -1;
              m['turn'] = 0;
            }
          } else {
            m['turn'] = 0;
          }
          if (dist < 9 && direction(dx) == e.facing)
            e.vx = e.facing * 1.1;
          else
            e.vx *= .8;
          if (!groundAhead(e)) e.vx = 0;
          if (dist < 2.1 &&
              direction(dx) == e.facing &&
              e.cooldown <= 0 &&
              (p.y - e.y).abs() < 1.5) {
            e.state = 'bash';
            e.timer = 0;
          }
          if (e.shield &&
              direction(dx) == e.facing &&
              dist < e.w / 2 + p.w / 2 + .15 &&
              (p.y - e.y).abs() < 1.8)
            damage(1, e.x);
          anim('walk', fps: e.vx.abs() > .3 ? 6 : 0);
        case 'crow':
          e.vx = 0;
          if (stunned) {
            e.y = math.min(e.y + 2 * dt, e.homeY + 3);
            anim('hurt', progress: .3);
            break;
          }
          if (m['carrying'] == true) {
            e.x += 4.5 * direction(e.x - p.x) * dt;
            e.y = math.max(1, e.y - 2 * dt);
            e.facing = direction(e.x - p.x);
            anim('fly', fps: 12);
            m['flee'] = number(m['flee']) + dt;
            if (number(m['flee']) > 7) {
              e.hp = 0;
              e.deathTime = 2;
            }
            break;
          }
          final orb = orbs
              .where(
                (o) =>
                    o['carrier'] == null &&
                    (number(o['x']) - e.x).abs() < 9 &&
                    (number(o['y']) - e.y).abs() < 9,
              )
              .firstOrNull;
          if (orb != null && e.state != 'swoop') {
            final ox = number(orb['x']) - e.x,
                oy = number(orb['y']) - e.y,
                d = math.max(.001, math.sqrt(ox * ox + oy * oy));
            e.x += ox / d * 6.5 * dt;
            e.y += oy / d * 6.5 * dt;
            e.facing = direction(ox);
            if (d < .6) {
              orb['carrier'] = e.id;
              m['carrying'] = true;
              message('Gagak mencuri energi!');
              sound?.call('caw');
            }
            anim('fly', fps: 14);
            break;
          }
          if (e.state == 'swoop') {
            final x = number(m['targetX']) - e.x,
                y = number(m['targetY']) - e.y,
                d = math.sqrt(x * x + y * y);
            if (e.timer < .9 && d > .3) {
              final speed = number(e.definition['swoopSpeed'], 9);
              e.x += x / d * speed * dt;
              e.y += y / d * speed * dt;
              if (p.overlaps(e.x, e.y - e.h / 2, e.w, e.h)) damage(1, e.x);
            } else {
              e.y -= 5 * dt;
              if (e.y <= e.homeY) {
                e.state = 'idle';
                e.cooldown = 3 + random.nextDouble();
                e.homeX = e.x;
              }
            }
            anim('swoop', progress: prog(.9));
            break;
          }
          e.x +=
              (e.homeX + math.sin(e.timer * .8) * 2 - e.x) *
              math.min(1, dt * 2);
          e.y +=
              (e.homeY + math.sin(e.timer * 1.7) * .4 - e.y) *
              math.min(1, dt * 2);
          e.facing = direction(dx);
          if (e.cooldown <= 0 && dist < 7 && !p.dead) {
            e.state = 'swoop';
            e.timer = 0;
            m['targetX'] = p.x;
            m['targetY'] = p.y - .6;
            sound?.call('caw');
          }
          anim('fly', fps: 10);
        case 'hound':
          if (stunned) {
            anim('hurt', progress: .3);
            e.vx *= .85;
            break;
          }
          if (noise != null &&
              number(noise!['t']) > 0 &&
              (number(noise!['x']) - e.x).abs() < 18 &&
              (number(noise!['y']) - e.y).abs() < 6) {
            m['targetX'] = noise!['x'];
            m['alert'] = true;
          }
          if (e.definition['hunter'] == true &&
              dist < 14 &&
              (p.y - e.y).abs() < 5) {
            m['targetX'] = p.x;
            m['alert'] = true;
          }
          if (e.state == 'bite') {
            anim('bite', progress: prog(.6));
            if (e.timer > .25 && e.timer < .45) {
              final scale = number(e.definition['scale'], 1);
              frontHit(e, 1.5 * scale, scale);
            }
            if (e.timer >= .6) {
              e.state = 'run';
              e.cooldown = 1;
            }
            e.vx *= .85;
            break;
          }
          if (dist < 1.7 && (p.y - e.y).abs() < 1.2 && e.cooldown <= 0) {
            e.facing = direction(dx);
            e.state = 'bite';
            e.timer = 0;
            break;
          }
          if (m['alert'] == true) {
            final tx = number(m['targetX']) - e.x;
            if (tx.abs() < .4) {
              m['alert'] = false;
              e.vx = 0;
            } else {
              e.facing = direction(tx);
              e.vx =
                  e.facing * number(e.definition['speed'], tweak('houndSpeed'));
            }
          } else {
            e.vx *= .8;
          }
          if (e.grounded &&
              e.groundTile == 3 &&
              !crumble.any((c) => c['x'] == e.x.floor()))
            crumble.add({'x': e.x.floor(), 'y': e.y.floor(), 't': .05});
          anim('run', fps: e.vx.abs() > .5 ? 14 : 0);
        case 'stitcher':
          if (stunned) {
            e.y = math.min(e.y + 1.5 * dt, e.homeY + 1.6);
            anim('hurt', progress: .4);
            break;
          }
          e.x +=
              (e.homeX + math.sin(e.timer * .6) * 1.2 - e.x) *
              math.min(1, dt * 2);
          e.y +=
              (e.homeY + math.sin(e.timer * 2) * .25 - e.y) *
              math.min(1, dt * 3);
          e.facing = direction(dx);
          if (e.state == 'cast') {
            anim('cast', progress: prog(.6));
            if (e.timer >= .55 && m['fired'] != true) {
              m['fired'] = true;
              final x = number(m['targetX']) - e.x,
                  y = number(m['targetY']) - (e.y - 1),
                  d = math.max(.001, math.sqrt(x * x + y * y));
              addShot(
                e.definition['fire'] == true ? 'fire' : 'thread',
                e.x,
                e.y - 1,
                x / d * 13,
                y / d * 13,
                extra: {'owner': e.id},
              );
              sound?.call('thread');
            }
            if (e.timer >= .6) {
              e.state = 'idle';
              e.cooldown = 3.4;
            }
            break;
          }
          if (p.thread?['id'] != e.id &&
              e.cooldown <= 0 &&
              dist < 8 &&
              !p.dead) {
            e.state = 'cast';
            e.timer = 0;
            m['fired'] = false;
            m['targetX'] = p.x;
            m['targetY'] = p.y - .2;
          }
          anim('float', fps: 6);
        case 'mimic':
          if (m['revealed'] != true) {
            anim('disguise', fps: 5);
            if (p.form == 'wolf' && dist < 6) {
              m['revealed'] = true;
              e.state = 'reveal';
              e.timer = 0;
              message('Tak ada bau kawanan — palsu!');
              sound?.call('growl');
            } else if (dist < 1.8 && (p.y - e.y).abs() < 1.5) {
              m['revealed'] = true;
              e.state = 'ambush';
              e.timer = 0;
              e.facing = direction(dx);
              sound?.call('growl');
            }
            break;
          }
          if (e.h < 1.3) e.h = 1.35;
          if (stunned) {
            anim('hurt', progress: .3);
            e.vx *= .85;
            break;
          }
          if (e.state == 'ambush') {
            anim('reveal', progress: prog(.35));
            if (e.timer > .25 && m['fired'] != true) {
              m['fired'] = true;
              frontHit(e, 1.9, 1.4);
            }
            if (e.timer > .6) e.state = 'hunt';
            break;
          }
          if (e.state == 'reveal') {
            anim('reveal', progress: prog(.6));
            if (e.timer > .6) e.state = 'hunt';
            break;
          }
          if (e.state == 'attack') {
            anim('attack', progress: prog(.7));
            if (e.timer > .25 && e.timer < .45) {
              e.vx = e.facing * 5;
              frontHit(e, 1.5, 1.3);
            } else {
              e.vx *= .8;
            }
            if (e.timer >= .7) {
              e.state = 'hunt';
              e.cooldown = 1.1;
            }
            break;
          }
          e.facing = direction(dx);
          e.vx = dist > 1.2 && dist < 12 ? e.facing * 2.6 : 0;
          if (!groundAhead(e)) e.vx = 0;
          if (dist < 1.6 && e.cooldown <= 0) {
            e.state = 'attack';
            e.timer = 0;
          }
          anim(
            'attack',
            progress: e.vx.abs() > .5 ? (e.animTime * .6) % .4 : 0,
          );
      }
      if (!e.fly) {
        e.vy = math.min(e.vy + 38 * dt, 20);
        moveActor(e, dt);
        if (e.y > rows + 2) killEnemy(e);
      }
    }
    enemies.removeWhere((e) => e.dead && e.deathTime >= 1.1);
    if (boss != null) updateBoss(boss!, dt);
  }

  void updateShots(double dt) {
    final p = player;
    for (final s in shots) {
      s['t'] = number(s['t']) + dt;
      s['x'] = number(s['x']) + number(s['vx']) * dt;
      s['y'] = number(s['y']) + number(s['vy']) * dt;
      final x = number(s['x']),
          y = number(s['y']),
          age = number(s['t']),
          kind = s['kind'];
      final blocked = solid(x.floor(), y.floor());
      if (kind == 'arrow') {
        if (blocked || age > 3) {
          s['gone'] = true;
          continue;
        }
        if (s['friendly'] != true) {
          if (p.overlaps(x, y, .001, .001)) {
            s['gone'] = true;
            damage(1, x - number(s['vx']));
            p.slowTime = number(s['slow']);
          }
        } else {
          for (final e in enemies.where((e) => !e.dead)) {
            if (e.overlaps(x, y, .001, .001)) {
              s['gone'] = true;
              hitEnemy(e, 2, 'arrow');
              break;
            }
          }
        }
      } else if (kind == 'thread') {
        if (blocked || age > 1.2) s['gone'] = true;
        if (s['gone'] != true &&
            p.invulnerable <= 0 &&
            p.overlaps(x, y, .4, .3)) {
          s['gone'] = true;
          p.thread = {'id': s['owner'], 't': 4.5};
          message('Terjahit! Tebas benangnya');
          sound?.call('thread');
        }
      } else if (kind == 'spirit') {
        if (age > 1.3) s['gone'] = true;
        final ids = s['ids'] as Set<String>;
        for (final e in [...enemies, if (boss?.active == true) boss!]) {
          if (!e.dead && !ids.contains(e.id) && e.overlaps(x, y, 2.2, 1.6)) {
            ids.add(e.id);
            hitEnemy(e, 4, 'spirit');
          }
        }
      } else if (kind == 'wave') {
        if (age > number(s['life'], 2.6) ||
            solid(
              (x + direction(number(s['vx'])) * .5).floor(),
              (y - .5).floor(),
            ))
          s['gone'] = true;
        if (s['gone'] != true &&
            s['hitPlayer'] != true &&
            p.overlaps(x, y - .4, 1.2, 1)) {
          s['hitPlayer'] = true;
          damage(1, x - number(s['vx']));
        }
      } else if (kind == 'drop') {
        if (number(s['wait']) > 0) {
          s['wait'] = number(s['wait']) - dt;
          s['x'] = x - number(s['vx']) * dt;
          s['y'] = y - number(s['vy']) * dt;
          continue;
        }
        s['vy'] = math.min(number(s['vy']) + 30 * dt, 16);
        if (blocked || y > rows + 1) {
          s['gone'] = true;
          fx('hit_spark', x, y - .2, scale: .4);
        }
        if (s['gone'] != true && p.overlaps(x, y, .5, .001)) {
          s['gone'] = true;
          damage(1, x);
        }
      } else {
        if (age > (kind == 'orb' ? 2.6 : 1.4) || (kind == 'fire' && blocked))
          s['gone'] = true;
        if (s['gone'] != true && p.overlaps(x, y, .3, .001)) {
          s['gone'] = true;
          damage(1, x - number(s['vx']));
        }
      }
    }
    shots.removeWhere((s) => s['gone'] == true);
  }
}
