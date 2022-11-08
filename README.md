# hyperstep
## [WIP] Intuitive and interactive representations for music production. 

Hyperstep stems from a desire to make music by navigating into and operating on relevant spaces. 
Many of the patterns we find in music originate from physical processes and interactions observed by humans in the 3d world. Hence, it is natural to build three-dimensional, immersive interfaces to interact with such processes and let music emerge as the result of those interactions.

## [Organic drums through agent self-regulation](https://github.com/a-sumo/hyperstep/blob/main/colab/agent_self_regulation.ipynb)
<details>
  <summary>Project Description</summary>
  
  
  In this notebook, I attempt to recreate organic temporal patterns and syncopation by modeling composition as an agent regulating internal properties through a set of sound-associated actions. The key insight is to assign opposite effects to kicks and snare/claps.
  
 The direction of these effects has been determined arbitrarily, although I believe there is a *grammar of processes* that can be derived from real-world observations.  
 I have done my best to derive the magnitude of the actions' effects through the analysis of audio features. 
 
 The direction and magnitude of the actions' effects can be greatly improved by integrating algorithms that estimate impact forces from sound such as Diffimpact. [[2](#diffimpact)]
  
Here are some of the model's outputs:
<details>
  <summary>Examples:</summary>
  
   [Example 1](https://user-images.githubusercontent.com/75185852/174502800-3452d939-b6da-4998-90c9-3c02c7bb5346.mp4)
  
   [Example 2](https://user-images.githubusercontent.com/75185852/188287025-1554ed5f-28c0-43af-9a73-7ea24ecfda6a.mp4)
  
   [Example 3](https://user-images.githubusercontent.com/75185852/188287983-2b5c1b88-3d5a-4941-b9a1-c1044aa83991.mp4)
  
</details>

The self-regulation model is fairly superficial and results in an implementation that is complicated and hard to control.  
**"The more factored a theory and the more emergent the observed phenomena from the theory, the more satisfying the theory."**  
*Daniel Shawcross Wilkerson, [Harmony Explained: Progress Towards A Scientific Theory of Music (2012)](https://arxiv.org/abs/1202.4212v1)*

A more appealing approach would be to consider drums as locomotive processes. [[1](#animacy)]  
By providing an agent with a *goal* in space, coupled with the use of drums as *actions that induce motion* and by carefully designing the *agent's environment*, we should derive rich and organic drum patterns.  

The main advantage is that the user would compose in a semantically rich and intuitive space(3D world) populated by intuitive objects (entities) rather than a space of buttons, knobs and MIDI files.   

However, this approach imposes the setup of a simulation environment and the refinement of algorithms that recover semantically relevant physical properties from sounds.  

<a id="animacy">
  
  [1][Yuri Broze. Animacy, Anthropomimesis, and Musical Line(2013)](https://etd.ohiolink.edu/apexprod/rws_etd/send_file/send?accession=osu1367425698)
  
</a>

<a id="diffimpact">
  
  [2][Samuel Clarke, Negin Heravi, Mark Rau, Ruohan Gao, Jiajun Wu, Doug James, Jeannette Bohg,  
DiffImpact: Differentiable Rendering and Identification of Impact Sounds(2021)](https://openreview.net/forum?id=wVIqlSqKu2D)
  
</a>
</details>
 
## [Volumetric synth control](https://a-sumo.github.io/hyperstep/)

<img src= "https://user-images.githubusercontent.com/75185852/199851952-30525228-27ca-4f32-9f7f-a04768d41703.mp4" width="500"/>
<img src= "https://user-images.githubusercontent.com/75185852/199347450-c1074afa-6426-4ecd-a25b-dc19c0291554.mp4" width="500"/>

<details>
  <summary>Project Description</summary>
  
  
  Here I visualize sound in the "shape" of the process most likely to have generated it. The goal is to recover this "shape" from real-world observations. You can try it at https://a-sumo.github.io/hyperstep/. Works best on Chrome, on short audio samples with isolated sounds. 
  
  Audio files used for the demos:
  



  [r2d2](https://freesound.org/people/mik300z/sounds/103525/) [kamehameha](https://www.youtube.com/watch?v=wolDR1gVrCo)

</details>
## Coming Soon: Sonic Vector Field
