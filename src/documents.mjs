export const pages = [
  {id:'controller', label:'Temperature control', source:'TactileTeleopControllerRev08.md', section:'Control', description:'How power predicts temperature, how resistance corrects it, and what one channel calculates each cycle.'},
  {id:'macro', label:'Foil pixel', source:'TactileTeleopMVPRev08/MacroTPP-MVP.md', section:'Circuit', description:'A single foil pixel: circuit, measurements and operation.'},
  {id:'wire-array', label:'Wire array', source:'TactileTeleopMVPRev08/WireArray-MVP.md', section:'Circuit', description:'Independent pixel drive and shared measurements for a 32-pixel array.'},
  {id:'wire-temperature', label:'Wire calibration', source:'TactileTeleopMVPRev08/WireTemperature-Calibration.md', section:'Calibration', description:'Resistance versus temperature from a long, same-stock wire in a closed kiln.'},
  {id:'simulation', label:'Pulse simulations', source:'TPP-Control-Simulation.md', section:'Numerical examples', description:'Pulse trains, individual pulse detail and the effect of modest model error.'},
  {id:'student-mvp', label:'Student MVP', source:'TPP-Student-MVP.md', section:'Unreviewed draft', unreviewed:true, description:'One definite implementation for a first foil-pixel controller.'}
];
