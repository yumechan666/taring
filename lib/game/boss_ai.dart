part of 'simulation.dart';

/// Boss state machines use the reference's windups, recovery windows and phases.
extension BossAI on JourneySimulation {
  void bossAnimation(
    Enemy b,
    String key,
    double dt, {
    double progress = -1,
    double fps = 8,
  }) {
    b.animTime = b.animation == key ? b.animTime + dt : 0;
    b.animation = key;
    b.animProgress = progress;
    b.animFps = fps;
  }

  void bossForm(Enemy b, String form) {
    b.form = form;
    b.w = form == 'human' ? .7 : 1.2;
    b.h = form == 'human'
        ? 1.7
        : form == 'wolf'
        ? .95
        : 2.6;
  }

  void bossPhysics(Enemy b, double dt) {
    if (b.state == 'under') return;
    b.vy = math.min(b.vy + 38 * dt, 20);
    moveActor(b, dt, noPlatforms: true);
    final arena = level['arena'];
    b.x = clamp(b.x, number(arena['x0']) + .6, number(arena['x1']) - .6);
  }

  void waves(Enemy b, double speed) {
    for (final dir in [-1, 1]) {
      addShot(
        'wave',
        b.x + dir * .8,
        b.y,
        dir * speed,
        0,
        extra: {'life': 2.6},
      );
    }
    fx('ground_wave', b.x, b.y, scale: 1.2);
    sound?.call('slam');
  }

  void updateBoss(Enemy b, double dt) {
    if (!b.active || b.dead) return;
    b.timer += dt;
    b.cooldown -= dt;
    if (area > 0) {
      areaBoss(b, dt);
      return;
    }
    final p = player, dx = p.x - b.x, dist = (p.x - b.x).abs(), m = b.memory;
    final phase = (m['phase'] as int?) ?? 1;
    if (b.state == 'intro') {
      b.facing = direction(dx);
      bossAnimation(b, 'human_idle', dt, fps: 6);
      if (b.timer > 1.8) {
        b.state = 'idle';
        b.timer = 0;
      }
      bossPhysics(b, dt);
      return;
    }
    final seen = formLog.reversed
        .where((f) => time - number(f['t']) >= tweak('bossMirrorDelay'))
        .firstOrNull;
    final want = seen?['form'] as String? ?? 'human';
    if (![
          'slash',
          'lunge',
          'wave',
          'eclipse',
          'transform',
          'stagger',
        ].contains(b.state) &&
        want != b.form &&
        want != 'eclipse') {
      b.state = 'transform';
      b.timer = 0;
      m['toForm'] = want;
    }
    if (b.stun > 0) {
      b.stun -= dt;
      b.vx *= .88;
      bossAnimation(
        b,
        b.form == 'wolf' ? 'wolf_idle' : 'human_idle',
        dt,
        fps: 3,
      );
      if (b.stun <= 0) {
        b.state = 'idle';
        b.cooldown = .6;
        if (b.form == 'eclipse') bossForm(b, want == 'wolf' ? 'wolf' : 'human');
      }
      bossPhysics(b, dt);
      return;
    }
    switch (b.state) {
      case 'transform':
        bossAnimation(
          b,
          'transform',
          dt,
          progress: clamp(
            b.form == 'human' ? b.timer / .6 : 1 - b.timer / .6,
            0,
            .99,
          ),
        );
        b.vx *= .8;
        if (b.timer >= .6) {
          bossForm(b, m['toForm']);
          b.state = 'idle';
          b.timer = 0;
          b.cooldown = .5;
        }
      case 'slash':
        bossAnimation(
          b,
          'human_slash',
          dt,
          progress: clamp(b.timer / .75, 0, .99),
        );
        if (b.timer > .3 && b.timer < .5) {
          b.vx = b.facing * (m['dash'] == true ? 10 : 3);
          frontHit(b, 2.2, 1.8);
        } else {
          b.vx *= .8;
        }
        if (b.timer >= .75) {
          b.state = 'idle';
          b.timer = 0;
          b.cooldown = phase > 1 ? .7 : 1.1;
          m['dash'] = false;
        }
      case 'lunge':
        if (b.timer < .35) {
          bossAnimation(
            b,
            'wolf_lunge',
            dt,
            progress: clamp(b.timer / .35, 0, .99) * .35,
          );
          b.vx = 0;
        } else if (b.timer < .75) {
          bossAnimation(
            b,
            'wolf_lunge',
            dt,
            progress: .4 + ((b.timer - .35) / .4) * .5,
          );
          b.vx = b.facing * 15;
          if (p.overlaps(b.x, b.y - b.h / 2, b.w, b.h)) damage(1, b.x);
        } else {
          bossAnimation(b, 'wolf_lunge', dt, progress: .95);
          b.vx *= .8;
        }
        if (b.timer >= 1.05) {
          b.state = 'idle';
          b.timer = 0;
          b.cooldown = phase > 1 ? 1.1 : 1.6;
        }
      case 'wave':
        bossAnimation(
          b,
          b.form == 'wolf' ? 'wolf_lunge' : 'human_slash',
          dt,
          progress: clamp(b.timer / .7, 0, .99),
        );
        b.vx = 0;
        if (b.timer >= .5 && m['fired'] != true) {
          m['fired'] = true;
          waves(b, 9);
        }
        if (b.timer >= .8) {
          b.state = 'idle';
          b.timer = 0;
          b.cooldown = .8;
        }
      case 'eclipse':
        bossAnimation(
          b,
          'eclipse_slam',
          dt,
          progress: (b.timer % 1.1) / 1.1 * .99,
        );
        b.vx = 0;
        if (b.timer >= .7 && number(m['slams']) < 1) {
          m['slams'] = 1;
          waves(b, 11);
        }
        if (b.timer >= 1.8 && number(m['slams']) < 2) {
          m['slams'] = 2;
          waves(b, 12);
        }
        if (b.timer >= 2.4) {
          b.state = 'stagger';
          b.stun = 2.2;
          message('Ia lengah!');
        }
      default:
        b.facing = direction(dx);
        if (phase >= 2) m['waveCd'] = number(m['waveCd'], 5) - dt;
        if (phase >= 3) m['eclipseCd'] = number(m['eclipseCd'], 6) - dt;
        if (phase >= 3 && number(m['eclipseCd']) <= 0) {
          b.state = 'eclipse';
          b.timer = 0;
          m['slams'] = 0;
          m['eclipseCd'] = 9;
          bossForm(b, 'eclipse');
          sound?.call('ulti');
          break;
        }
        if (phase >= 2 && number(m['waveCd']) <= 0) {
          b.state = 'wave';
          b.timer = 0;
          m['fired'] = false;
          m['waveCd'] = 6.5;
          break;
        }
        if (b.form == 'human') {
          if (dist > 1.8)
            b.vx = b.facing * 4.2;
          else
            b.vx *= .7;
          if (b.cooldown <= 0 &&
              (dist < 2.2 ||
                  (phase > 1 && dist < 6 && random.nextDouble() < .02))) {
            b.state = 'slash';
            b.timer = 0;
            m['dash'] = dist >= 2.2;
            sound?.call('attack');
          }
          bossAnimation(
            b,
            b.vx.abs() > .5 ? 'human_run' : 'human_idle',
            dt,
            fps: b.vx.abs() > .5 ? 12 : 6,
          );
        } else {
          if (dist < 3.5)
            b.vx = -b.facing * 4;
          else if (dist > 6.5)
            b.vx = b.facing * 5;
          else
            b.vx *= .8;
          if (b.cooldown <= 0 && dist < 9) {
            b.state = 'lunge';
            b.timer = 0;
            sound?.call('growl');
          }
          bossAnimation(
            b,
            b.vx.abs() > .5 ? 'wolf_run' : 'wolf_idle',
            dt,
            fps: b.vx.abs() > .5 ? 14 : 6,
          );
        }
    }
    b.sheet =
        [
          'human_idle',
          'human_run',
          'human_slash',
          'transform',
        ].contains(b.animation)
        ? 'BOSS_HUMAN'
        : 'BOSS_WOLF';
    bossPhysics(b, dt);
  }

  void areaBoss(Enemy b, double dt) {
    final p = player,
        arena = level['arena'],
        m = b.memory,
        fast = b.hp < b.maxHp * .5 ? 1.25 : 1.0;
    final dx = p.x - b.x,
        dist = dx.abs(),
        range = number(b.definition['range']);
    final rig = b.definition['rig'];
    final names = rig == 'human'
        ? ['human_idle', 'human_run', 'human_slash', 'transform']
        : rig == 'wolf'
        ? ['wolf_idle', 'wolf_run', 'wolf_lunge', 'eclipse_slam']
        : ['idle', 'move', 'attack', 'special'];
    void anim(int role, {double progress = -1, double fps = 8}) =>
        bossAnimation(b, names[role], dt, progress: progress, fps: fps);
    void done() {
      b.state = 'idle';
      b.timer = 0;
      b.cooldown = .7;
    }

    if (b.stun > 0) {
      b.stun -= dt;
      b.vx *= .85;
      anim(0, fps: 3);
      bossPhysics(b, dt);
      return;
    }
    switch (b.state) {
      case 'intro':
        b.facing = direction(dx);
        anim(0, fps: 6);
        if (b.timer > 1.8) {
          b.state = 'idle';
          b.timer = 0;
        }
      case 'attack':
        anim(2, progress: clamp(b.timer / .8, 0, .99));
        if (b.timer > .32 && b.timer < .55) {
          b.vx = b.facing * 3;
          frontHit(b, range + .6, b.h + .3, back: .3);
        } else {
          b.vx *= .8;
        }
        if (b.timer >= .8) {
          b.state = 'idle';
          b.timer = 0;
          b.cooldown = 1.1 / fast;
        }
      case 'charge':
        if (b.timer < .55) {
          anim(0, fps: 14);
          b.vx = 0;
          b.facing = direction(dx);
        } else if (b.timer < 1.35) {
          anim(1, fps: 16);
          b.vx = b.facing * 15 * fast;
          if (p.overlaps(b.x, b.y - b.h / 2, b.w, b.h)) damage(1, b.x);
          if ((b.x <= number(arena['x0']) + 1 && b.vx < 0) ||
              (b.x >= number(arena['x1']) - 1 && b.vx > 0)) {
            b.timer = 1.35;
            sound?.call('slam');
          }
        } else {
          b.state = 'idle';
          b.stun = 1.1;
          b.cooldown = .8;
          message('Lengah!');
        }
      case 'waves':
        anim(3, progress: clamp(b.timer / .9, 0, .99));
        b.vx = 0;
        if (b.timer > .55 && number(m['fired']) < 1) {
          m['fired'] = 1;
          waves(b, 10 * fast);
        }
        if (b.timer >= 1) done();
      case 'swarm':
        anim(3, progress: clamp(b.timer / 1.1, 0, .99));
        b.vx = 0;
        if (b.timer > .4 && number(m['fired']) < 1) {
          m['fired'] = 1;
          final n = fast > 1 ? 8 : 6;
          for (var i = 0; i < n; i++) {
            addShot(
              'drop',
              clamp(
                p.x + (i - n / 2) * 1.8 + random.nextDouble() - .5,
                number(arena['x0']) + 1,
                number(arena['x1']) - 1,
              ),
              -1 - i * .9,
              0,
              0,
              extra: {'wait': .5 + i * .12},
            );
          }
          sound?.call('thread');
        }
        if (b.timer >= 1.2) done();
      case 'summon':
        anim(3, progress: clamp(b.timer, 0, .99));
        b.vx = 0;
        if (b.timer > .5 && number(m['fired']) < 1) {
          m['fired'] = 1;
          if (enemies.where((e) => !e.dead).length < 4) {
            final pool = areaDefinition['monsters'] as List;
            for (var i = 0; i < 2; i++) {
              enemies.add(
                makeEnemy({
                  'type': pool[i % pool.length],
                  'x': clamp(
                    b.x + (i == 1 ? 3 : -3),
                    number(arena['x0']) + 2,
                    number(arena['x1']) - 2,
                  ),
                  'y': 11.5,
                  'hpMul': number(level['hpMul'], 1) * .6,
                }, 'summon${time}_$i'),
              );
            }
          }
        }
        if (b.timer >= 1.1) done();
      case 'burrow':
        if (b.timer < .6) {
          anim(3, progress: clamp(b.timer / .6, 0, .99));
          b.vx = 0;
        } else if (b.timer < 1.9) {
          b.state = 'under';
        }
      case 'under':
        b.alpha = 0;
        b.x += clamp(p.x - b.x, -9 * dt, 9 * dt);
        m['telegraph'] = b.x;
        if (b.timer > 1.9) {
          b.state = 'erupt';
          b.timer = 0;
          b.alpha = 1;
          m.remove('telegraph');
          sound?.call('slam');
          fx('dust', b.x, b.y, scale: 1.6);
        }
      case 'erupt':
        anim(2, progress: clamp(b.timer / .7, 0, .99));
        if (b.timer < .35 && p.overlaps(b.x, b.y - 1.5, 2.8, 3)) damage(1, b.x);
        if (b.timer >= .7) {
          b.state = 'idle';
          b.stun = 1.2;
          b.cooldown = .8;
          b.specialCooldown = 4.5 / fast;
        }
      case 'rings':
        anim(3, progress: clamp(b.timer / 1.2, 0, .99));
        b.vx = 0;
        void fire(double offset) {
          for (var i = 0; i < 10; i++) {
            final a = offset + i / 10 * math.pi * 2;
            addShot(
              'orb',
              b.x,
              b.y - b.h * .6,
              math.cos(a) * 6.5,
              math.sin(a) * 6.5,
            );
          }
          sound?.call('deflect');
          fx('howl_rings', b.x, b.y - b.h * .6, scale: 1.6);
        }
        if (b.timer > .35 && number(m['fired']) < 1) {
          m['fired'] = 1;
          fire(0);
        }
        if (b.timer > .9 && number(m['fired']) < 2) {
          m['fired'] = 2;
          fire(math.pi / 10);
        }
        if (b.timer >= 1.3) done();
      case 'teleport':
        if (b.timer < .4) {
          b.alpha = 1 - b.timer / .4;
          anim(3, progress: clamp(b.timer / .4, 0, .99));
        } else if (number(m['fired']) < 1) {
          m['fired'] = 1;
          b.x = clamp(
            p.x - p.facing * 2.2,
            number(arena['x0']) + 1,
            number(arena['x1']) - 1,
          );
          b.facing = direction(p.x - b.x);
          fx('shadow_burst', b.x, b.y - 1, scale: 1.2);
        } else {
          b.alpha = math.min(1, b.alpha + dt * 5);
          if (b.timer > .6) {
            b.state = 'attack';
            b.timer = 0;
          }
        }
      default:
        b.alpha = 1;
        b.facing = direction(dx);
        b.specialCooldown -= dt;
        if (b.specialCooldown <= 0) {
          b.specialCooldown = 5.5 / fast;
          final specials = b.definition['specials'] as List;
          b.state = specials[b.specialIndex++ % specials.length];
          b.timer = 0;
          m['fired'] = 0;
          break;
        }
        if (dist > range * .8)
          b.vx = b.facing * number(b.definition['speed']) * fast;
        else
          b.vx *= .7;
        if (b.cooldown <= 0 && dist < range + .4 && (p.y - b.y).abs() < 3) {
          b.state = 'attack';
          b.timer = 0;
          sound?.call('attack');
        }
        anim(b.vx.abs() > .5 ? 1 : 0, fps: b.vx.abs() > .5 ? 12 : 6);
    }
    bossPhysics(b, dt);
  }

  void bossHit(Enemy b, double amount, String kind) {
    if (!b.active ||
        b.dead ||
        b.state == 'intro' ||
        b.state == 'under' ||
        b.alpha < .5)
      return;
    final same =
        area == 0 &&
        player.form != 'eclipse' &&
        b.form != 'eclipse' &&
        b.form == player.form;
    var multiplier = same ? .3 : 1.0;
    if (b.stun > 0 || b.state == 'transform')
      multiplier *= area == 0 ? 1.6 : 1.5;
    if (area == 0 &&
        b.state == 'lunge' &&
        b.timer > .35 &&
        player.form == 'human' &&
        kind != 'hook') {
      b.state = 'stagger';
      b.stun = 1.6;
      b.vx = -b.facing * 6;
      message('Tangkis! Kait sekarang!');
      sound?.call('deflect');
    }
    final hits = const ['spirit', 'lightning', 'burn'].contains(kind)
        ? 1
        : buffs['hits'] as int;
    for (var i = 0; i < hits && !b.dead; i++) {
      b.hp -= amount * multiplier;
      combo++;
      comboTimer = 2.4;
      bestCombo = math.max(bestCombo, combo);
      score += 10 * math.min(combo, 30);
      gain(same ? 1 : 3);
    }
    if (same) message('Wujud sama — ganti wujud!');
    fx('hit_spark', b.x, b.y - b.h * .6, scale: same ? .4 : .7);
    sound?.call(same ? 'deflect' : 'hit');
    final phase = number(b.memory['phase'], 1).toInt();
    if (area == 0) {
      if (phase == 1 && b.hp / b.maxHp < .66) {
        b.memory['phase'] = 2;
        b.memory['waveCd'] = 2;
        message('Gelombang bayangan! Lolong di altar untuk pijakan');
      } else if (phase == 2 && b.hp / b.maxHp < .33) {
        b.memory['phase'] = 3;
        b.memory['eclipseCd'] = 2;
        message('Ia memakai Eclipse-nya sendiri!');
      }
    } else if (phase == 1 && b.hp < b.maxHp * .5) {
      b.memory['phase'] = 2;
      b.specialCooldown = 1.5;
      message('${areaDefinition['boss']} mengamuk!');
    }
    if (b.dead) {
      b.hp = 0;
      score += 2000 + area * 300;
      sound?.call('win');
      fx('shadow_burst', b.x, b.y - 1, scale: 2.6);
    }
  }
}
