import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'simulation.dart';
import 'taring_game.dart';

/// The same 24-unit paths as the original touch controls, painted by Flutter.
class MoonIcon extends StatelessWidget {
  const MoonIcon(this.name,{super.key,this.size=24,this.color=const Color(0xffcfe4ff)});
  final String name;
  final double size;
  final Color color;
  @override
  Widget build(BuildContext context)=>SizedBox.square(dimension:size,child:CustomPaint(painter:_MoonIconPainter(name,color)));
}
class _MoonIconPainter extends CustomPainter {
  _MoonIconPainter(this.name,this.color);
  final String name;final Color color;
  @override
  void paint(Canvas c,Size size){
    c.save();c.scale(size.width/24,size.height/24);
    final p=Path(),paint=Paint()..color=color..style=PaintingStyle.stroke..strokeWidth=2.2..strokeCap=StrokeCap.round..strokeJoin=StrokeJoin.round;
    switch(name){
      case 'left':p.moveTo(15,5);p.lineTo(8,12);p.lineTo(15,19);
      case 'right':p.moveTo(9,5);p.lineTo(16,12);p.lineTo(9,19);
      case 'down':p.moveTo(5,9);p.lineTo(12,16);p.lineTo(19,9);
      case 'jump':p.moveTo(12,20);p.lineTo(12,6);p.moveTo(6,11);p.lineTo(12,5);p.lineTo(18,11);
      case 'sickle':p.moveTo(5,21);p.lineTo(11,15);p.cubicTo(16,14.5,19.5,10.5,19.5,4);p.cubicTo(15.5,4.5,11.5,8,11,15);p.close();
      case 'claw':for(final x in [8.0,13.0,18.0]){p.moveTo(x,3);p.lineTo(x-3,21);}
      case 'hook':p.moveTo(12,2);p.lineTo(12,12);p.arcToPoint(const Offset(17,17),radius:const Radius.circular(5),largeArc:true,clockwise:false);p.lineTo(19.5,14.5);p.addOval(Rect.fromCircle(center:const Offset(12,2.5),radius:.6));
      case 'pounce':p.moveTo(4,20);p.lineTo(15,9);p.moveTo(9,8);p.lineTo(16,8);p.lineTo(16,15);p.addOval(Rect.fromCircle(center:const Offset(19,5),radius:2));
      case 'slam':p.moveTo(12,3);p.lineTo(12,13);p.moveTo(7,9);p.lineTo(12,14);p.lineTo(17,9);p.moveTo(3,20);p.lineTo(21,20);
      case 'wolf':p.moveTo(5,3);p.lineTo(8,9);p.lineTo(16,9);p.lineTo(19,3);p.lineTo(19,13);p.lineTo(12,21);p.lineTo(5,13);p.close();p.moveTo(9.5,12.5);p.lineTo(9.51,12.5);p.moveTo(14.5,12.5);p.lineTo(14.51,12.5);
      case 'hood':p.moveTo(5,21);p.cubicTo(5,12,8,4,12,4);p.cubicTo(16,4,19,12,19,21);p.moveTo(9,13);p.cubicTo(10,14.5,14,14.5,15,13);
      case 'pause':p.moveTo(9,5);p.lineTo(9,19);p.moveTo(15,5);p.lineTo(15,19);
      default:
        p.moveTo(15,3);p.arcToPoint(const Offset(21,18),radius:const Radius.circular(9),largeArc:true,clockwise:false);p.arcToPoint(const Offset(15,3),radius:const Radius.circular(7),clockwise:true);p.close();
        if(name=='howl'){p.moveTo(4,21);p.lineTo(7,18);p.moveTo(2,17);p.lineTo(5,16);}
    }
    c.drawPath(p,paint);c.restore();
  }
  @override
  bool shouldRepaint(_MoonIconPainter old)=>old.name!=name || old.color!=color;
}

class AtlasIcon extends StatelessWidget {
  const AtlasIcon({super.key,required this.game,required this.name,required this.height});
  final TaringGame game;final String name;final double height;
  @override
  Widget build(BuildContext context)=>SizedBox(width:height*229/225,height:height,child:CustomPaint(painter:_AtlasIconPainter(game,name)));
}
class _AtlasIconPainter extends CustomPainter {
  _AtlasIconPainter(this.game,this.name);
  final TaringGame game;final String name;
  @override
  void paint(Canvas canvas,Size size){
    final frame=game.sheets['PROPS_OBJECTS']?['names'][name] as Json?,image=game.pictures['PROPS_OBJECTS'];
    if(frame==null || image==null)return;
    final content=(frame['content']??frame['source']) as Json;
    final source=game.rect(content),scale=math.min(size.width/source.width,size.height/source.height);
    final target=Rect.fromCenter(center:Offset(size.width/2,size.height/2),width:source.width*scale,height:source.height*scale);
    canvas.drawImageRect(image,source,target,Paint()..filterQuality=FilterQuality.low);
  }
  @override
  bool shouldRepaint(_AtlasIconPainter old)=>old.name!=name || old.game!=game;
}
