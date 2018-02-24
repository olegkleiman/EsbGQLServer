// @flow
import { GraphQLScalarType } from 'graphql';
import { Kind } from 'graphql/language';
import _ from 'lodash';
import casual from 'casual';
import moment from 'moment';
import rp from 'request-promise';
import { GraphQLError } from 'graphql/error';
import mockServices from './MockServices';
import mockServiceRequests from './MockServiceRequests';
import mockCategories from './MockCategories';
import Kafka from 'no-kafka';
import elasticsearch from 'elasticsearch';

import { PubSub } from 'graphql-subscriptions';
//import { KafkaPubSub } from 'graphql-kafka-subscriptions'

if( !isMockMode() ) {

    var consumer = new Kafka.SimpleConsumer({
      connectionString: "10.1.70.101:9092",
      asyncCompression: true
    })

    var dataHandler = function(messageSet, topic, partition){

      messageSet.forEach(function (m){

        const message = m.message.value.toString('utf-8');
        var trace = JSON.parse(message);
        let newTrace = new Trace(casual.uuid,
                                 trace.message_guid,
                                 "ERROR",
                                 trace.service_name,
                                 trace.service_id
                               );

        pubsub.publish(TRACE_ADDED_TOPIC, {
                                            traceAdded: newTrace
                                         });

      })

    }

    consumer.init().then( function() {
      return consumer.subscribe('esbmsgs_ppr', 0,
                                dataHandler);
    })
}

const pubsub = new PubSub();
const TRACE_ADDED_TOPIC = 'newTrace';
const SERVICE_REQUEST_DELETED_TOPIC = 'deletedSReq';

const esHost = isMockMode() ? 'localhost' : '10.1.70.47';
var elasticClient = new elasticsearch.Client({
  host: `${esHost}:9200`
  //log: 'trace'
});

elasticClient.cluster.health({}, function(err, resp, status) {
  console.log("Elastic Health: ", resp);
})

const MOCK_TIMEOUT = 1000;

class EsbAPI {

  static getCategory(categoryId: number) : Promise {

    return new Promise( (resolve, reject) => {

        setTimeout( () => {

          let category = mockCategories.find(category => category.CategoryId == categoryId);
          resolve(category);

        }, MOCK_TIMEOUT);
    })

  }

  static getAllCategories(): Promise {

    return new Promise( (resolve, reject) => {

      setTimeout( () => {

        resolve(_.assign([], mockCategories));

      }, MOCK_TIMEOUT);
    })
  }

  static getServicesCount() : number {
    return mockServices.length;
  }

  static getAllServices() : Promise {

    return new Promise( (resolve, reject) => {

      setTimeout( () => {

        resolve(_.assign([], mockServices));

      }, MOCK_TIMEOUT);
    });

  }

  static getService(objectId: number) : Service {
    return new Service(casual.uuid,
                      objectId,
                      casual.title,
                      casual.url);
  }

  static getServicesByCategoryId(categoryId: number) : Promise {

    return new Promise( (resolve, reject) => {

        setTimeout( () => {

           let categorizedServices = mockServices.filter( (service) => {
             return service.CategoryId == categoryId;
           });

           resolve(_.assign([], categorizedServices));

        }, MOCK_TIMEOUT);
    })
  }

  static getServiceRequests() : Promise {
    return new Promise( (resolve, reject) => {

      setTimeout( () => {

        resolve(_.assign([], mockServiceRequests));

      }, MOCK_TIMEOUT);
    });
  }
}

function isMockMode(): boolean {

  let mockToken = process.argv.find( (arg: string) => {
    return arg == "--mock"
  });

  return mockToken;
}

class SetInfo {

  constructor(total, list) {
    this.id = casual.uuid;
    this.totalItems = total;
    this.list = list;
  }

}

class Service {

  constructor(id: string,
              objectId: number,
              name: string,
              address: string,
              description: string,
              sla: number,
              categoryId: number,
              when_published: Date) {
    this.id = id;
    this.objectId = objectId;
    this.name = name;
    this.address = address;
    this.description = description;
    this.sla = sla;
    this.categoryId = categoryId;
    this.when_published = when_published;
  }

}

const repositoryId : string = casual.uuid;

class Repository {

  constructor() {

    this.id = repositoryId;

    this.services = this.services.bind(this);
    this.categories = this.categories.bind(this);
  }

  services({categoryId, page, pageSize}) {

    //const categoryId = param.categoryId;
    if( isMockMode() ) {

      if( !categoryId ) {

        let promise = EsbAPI.getAllServices();

        return new SetInfo(EsbAPI.getServicesCount(),
          promise.then( res => (

            res.map( service => (

              {
                id: 'svc' +  service.Id,
                objectId: service.Id,
                categoryId: service.CategoryId,
                name: service.Name,
                address: service.Url,
                sla: service.ExpectedSla
              }

            ))

        ))

      )

      } else {

        let promise = EsbAPI.getServicesByCategoryId(categoryId);

        return new SetInfo(EsbAPI.getServicesCount(),
          promise.then( res => (

           res.map( service => (

            {
              id: 'svc' + service.Id,
              objectId: service.Id,
              categoryId: service.CategoryId,
              name: service.Name,
              address: service.Url,
              environment: service.environment,
              sla: service.ServiceSLA
            }

          ))

        ))
      );

      }

    } else{

      let url = ( !categoryId ) ?
               //'http://esb01node01/ESBUddiApplication/api/Services'
               'http://m2055895-w7/ESBUddiApplication/api/Services'
               : //'http://esb01node01/ESBUddiApplication/api/Services?categoryId=' + categoryId;
               'http://m2055895-w7/ESBUddiApplication/api/Services?categoryId=' + categoryId;

      if( page )
          // 'http://esb01node01/ESBUddiApplication/api/Services'
          url = `http://m2055895-w7/ESBUddiApplication/api/Services?pageNum=${page}&pageSize=${pageSize}`;

      return rp({
        uri: url,
        headers: {
          'User-Agent': 'GraphQL'
        },
        json: true
      }).then( ({list, totalRows}) => {

        let services = list.map( (service) => (
          {
            id: 'svc' + service.ServiceId,
            objectId: service.ServiceId,
            name: service.Name,
            categoryId: service.CategoryId,
            description: service.Description,
            address: service.Url,
            pattern: ( service.PatternId == 1 ) ? "Soap" : "Rest",
            environment: ( service.Environment == 1 ) ? "Internal" : "External",
            sla: service.ExpectedSla
          }
        ));

        return new SetInfo(totalRows, services);

      }).catch( (data) => {
        return Promise.reject(data.error.message);
      })

    }
  }

  categories() {

    if( isMockMode() ) {

        let promise = EsbAPI.getAllCategories();
        return promise.then( res => {

            return res.map( (category) => {

              return {
                id: casual.uuid,
                objectId: category.CategoryId,
                name: category.CategoryName
              }
            });

        });

    } else {

        //const url = 'http://esb01node01/ESBUddiApplication/api/Categories';
        const url = 'http://m2055895-w7/EsbUddiApplication/api/Categories';

        return rp({
          uri: url,
          headers: {
            'User-Agent': 'GraphQL'
          },
          json: true
        }).then( res => {

          return res.map( (category) => {
            return {
              id: casual.uuid,
              objectId: category.CategoryId,
              name: category.CategoryName
            }
          });

        }).catch( (data) => {
          return Promise.reject(data.error.message);
        })

    }
  }

  serviceRequests() {

    if( isMockMode() ) {
      let promise = EsbAPI.getServiceRequests();
      return promise.then( res => {

        return res.map( (request) => {

          return {
            id:  request.id,
            address: request.Url,
            operationName: request.OperationName,
            name: request.ServiceName,
            objectId: request.RequestId,
            categoryId: request.CategoryId,
            sla: request.ExpectedSla,
            environment: request.Environment,
            created: request.PublishRequestDate,
          }

        });

      });
    } else {

      //const url = 'http://esb01/ESBUddiApplication/api/PublishRequest';
      const url = 'http://m2055895-w7/ESBUddiApplication/api/PublishRequest'

      return rp({
        uri: url,
        headers: {
          'User-Agent': 'GraphQL'
        },
        json: true
      }).then( res => {

        return res.map( (request) => {
          return {
            id:  'sreq' + request.RequestId, //casual.uuid,
            objectId: request.RequestId,
            address: request.Url,
            operationName: request.OperationName,
            name: request.ServiceName,
            categoryId: request.CategoryId,
            environment: request.Environment,
            sla: request.ExpectedSla,
            created: request.PublishRequestDate
          }
        });

      }).catch( (data) => {
        return Promise.reject(data.error.message);
      })

    }
  }

}

class Trace {
  constructor(id,
              storyId,
              status: string,
              serviceName: string,
              serviceId) {
    this.id = id
    this.storyId = storyId;
    this.time = new Date();
    this.message = 'Request received';
    this.eventId = casual.integer(1, 1000);
    this.status = status;

    this.serviceName = serviceName;
    this.serviceId = serviceId;
  }

}

class Summary {
  constructor(date: Date, value: number) {
    this.id = casual.uuid;
    this.date = date;
    this.value = value;
  }

}

class Serie {
  constructor(name: string, daysBefore: number, serviceId: number) {
    this.id = casual.uuid;
    this.label = name;
    this.data = casual.array_of_digits(daysBefore);
    this.serviceId = serviceId;
  }

}

class Series {
  constructor(daysBefore: number,
              servicesIds: number[]) {
    this.id = casual.uuid;

    let labels = []
    for(let i = 0; i < daysBefore; i++) {
      let date = new Date();
      date.setDate(date.getDate() - i);
      labels.push(moment(date).format('DD/MM/YYYY'));
    }

    this.labels = labels;

    this.series = [];
    for(let i = 0; i < servicesIds.length; i++) {
      let service = EsbAPI.getService(servicesIds[i]);
      this.series.push(new Serie(service.name, daysBefore, service.objectId));
    }
  }

}

class EsbRuntime {

  constructor() {
    this.id = casual.uuid;
  }

  distribution({daysBefore, servicesIds}: {daysBefore: number, servicesIds: ?number[]}) {
    let _servicesIds: ?number[] = servicesIds;
    let _daysBefore: number = daysBefore;

    return new Series(_daysBefore, _servicesIds);
  }

  totalCalls({before} : {before : number}) {

    let summaries = [];
    let gte = `now-${before}d/d`;

    return elasticClient.search({
      index: 'esb',
      type: 'runtime',
      sort: 'ref_date:desc',
       "_source": ["ref_date", "calls"],
      body: {
        query: {
          "range" : {
            "ref_date": {
              "gte": gte,
              "lt": "now+1d/d"
            }
          }
        }
      }

    }).then( response => {

      response.hits.hits.forEach((hit) => {
        summaries.push(new Summary(hit._source.ref_date, hit._source.calls));
      });

      return summaries;
    })

  }

  latency({before}: {before : number}) {

    let summaries = [];
    let gte = `now-${before}d/d`;

    return elasticClient.search({
      index: 'esb',
      type: 'runtime',
      sort: 'ref_date:desc',
       "_source": ["ref_date", "latency"],
      body: {
        query: {
          "range" : {
            "ref_date": {
              "gte": gte,
              "lt": "now+1d/d"
            }
          }
        }
      }

    }).then( response => {

      response.hits.hits.forEach((hit) => {
        summaries.push(new Summary(hit._source.ref_date, hit._source.latency));
      });

      return summaries;
    })

  }

  errors({before}: {before: number}) {

    let summaries = [];
    let gte = `now-${before}d/d`;

    return elasticClient.search({
      index: 'esb',
      type: 'runtime',
      sort: 'ref_date:desc',
       "_source": ["ref_date", "errors"],
      body: {
        query: {
          "range" : {
            "ref_date": {
              "gte": gte,
              "lt": "now+1d/d"
            }
          }
        }
      }

    }).then( response => {

      response.hits.hits.forEach((hit) => {
        summaries.push(new Summary(hit._source.ref_date, hit._source.errors));
      });

      return summaries;
    })

  }

}

class ServiceRequest {
  constructor(id: string,
              name: string,
              objectId: number,
              categoryId: number,
              operationName: string,
              uri: string,
              soapAction: string,
              environment: number = 1 | 2,
              sla: number,
              created: Date) {
    this.id = id;
    this.name = name;
    this.objectId = objectId;
    this.categoryId = categoryId;
    this.operationName = operationName;
    this.address = uri;
    this.soapAction = soapAction;
    this.environment = (environment == 1) ? 'External' : 'Internal';
    this.sla = sla,
    this.created = new Date(created);
  }

}

export const resolvers = {

  Query: {

    repository: (_, args, context) => {
      return new Repository();
    },

    runtime: (_, args, context) => {
      return new EsbRuntime()
    }
  },

  Mutation: {

    addService: function(_, {input}, context) {

      if( isMockMode() ) {

        let serviceId = casual.uuid;
        return new ServiceRequest(serviceId,
                           casual.title,
                           casual.integer(2000, 3000),
                           input.categoryId,
                           casual.title,
                           casual.url,
                           input.soapAction,
                           1,
                           casual.integer(200, 1000),
                           new Date());
      }
      else {

        //const url = 'http://esb01node01/ESBUddiApplication/api/Services';
        const url = 'http://m2055895-w7/ESBUddiApplication/api/Services';

        return rp({
          method: 'POST',
          uri: url,
          body: {

              "Name": input.name,
              "Description": null,
              "Url": input.address,
              "SoapAction": input.soapAction,
              "WsdlUrl": input.wsdlUrl,
              "ExpectedSla": input.sla,
              "Pattern": input.pattern,
              "Documentation": null,
              "CategoryId": input.categoryId,
              "Environment": input.environment,
              "OperationName" : null,
              "TargetNameSpace": null
          },
          headers: {
            'User-Agent': 'GraphQL'
          },
          json: true
        }).then( res => {
          console.log(res);

          return new ServiceRequest(casual.uuid,
                                    res.ServiceName,
                                    res.RequestId,
                                    res.CategoryId,
                                    res.ServiceName,
                                    res.Url,
                                    res.ServiceSoapAction,
                                    res.Environment,
                                    res.ExpectedSla,
                                    res.PublishRequestDate);

        }).catch( (error) => {
          console.log(error.message);
          return new GraphQLError(error.message);
        });

      }
    },

    publishServiceRequest: function(_, {input}, context): Service {

        let requestId: number = input;

        if( isMockMode() ) {
            return new Service(casual.uuid,
                               casual.integer(300, 400),
                               casual.title,
                               casual.url,
                               casual.description,
                               casual.integer(100, 200),
                               casual.integer(1,2),
                               new Date());
        } else {
            const url = 'http://m2055895-w7/ESBUddiApplication/api/PublishRequest?requestId=' + requestId;

            return rp({
              method: 'POST',
              uri: url,
              headers: {
                'User-Agent': 'GraphQL',
                'Accept': 'application/json'
              },
              json: true
            }).then( res => {
              console.log(res);
            }).catch( err => {
              console.log(err);
              return new GraphQLError(err.error.Message);
            });
        }
    },

    deleteServiceRequest: function(_, {requestId} : { requestId: number}) {

      const _id = 'sreq' + requestId;

      if( isMockMode() ) {

        const serviceRequest = new ServiceRequest(_id);
        pubsub.publish(SERVICE_REQUEST_DELETED_TOPIC, {
            serviceRequestDeleted: serviceRequest
        });
        return serviceRequest;

      } else {
        const url = 'http://m2055895-w7/ESBUddiApplication/api/PublishRequest?requestId=' + requestId;
        return rp({
          method: 'DELETE',
          uri: url,
          headers: {
            'User-Agent': 'GraphQL',
            'Accept': 'application/json'
          },
          json: true
        }).then( res => {

          let serviceRequest = new ServiceRequest(_id);
          pubsub.publish(SERVICE_REQUEST_DELETED_TOPIC, {
              serviceRequestDeleted: serviceRequest
          });
          return serviceRequest;

        }).catch( err => {
          console.log(err);
          return new GraphQLError(err.error.Message);
        })
      }

    },

    disableService(_, {input}, context) {

      //if( isMockMode() ) {

        let serviceId = casual.uuid;
        return new Service(serviceId,
                           casual.title,
                           casual.integer(2000, 3000),
                           input.categoryId,
                           casual.title,
                           casual.url,
                           input.soapAction,
                           1,
                           casual.integer(200, 1000),
                           new Date());
      //}
    },

    deleteService(_, {input}, context) {
      //if( isMockMode() ) {

        let serviceId = casual.uuid;
        return new Service(serviceId,
                           casual.title,
                           casual.integer(2000, 3000),
                           input.categoryId,
                           casual.title,
                           casual.url,
                           input.soapAction,
                           1,
                           casual.integer(200, 1000),
                           new Date());
      //}

    },

  },


  Subscription: {

      // Subscriptions resolvers are not a functions,
      // but an objects with subscribe method, than returns AsyncIterable.
      serviceRequestDeleted: {
        subscribe: () => {
          console.log('Subscribed to serviceRequestDeleted');

          return pubsub.asyncIterator(SERVICE_REQUEST_DELETED_TOPIC);
        }
      },

      traceAdded: {
        subscribe: () => {
          console.log('Subscribed to traceAdded');

          if( isMockMode() ) {
            setInterval( () => {

              let service = casual.random_element(mockServices);
              var statuses = ['INFO', 'WARNING', 'ERROR'];
              let status = casual.random_element(statuses);

              const newTrace = new Trace(casual.uuid, //id
                                         casual.uuid, // storyId
                                         status,
                                         service.Name,
                                         service.Id
                                       );
              return pubsub.publish(TRACE_ADDED_TOPIC, {
                                                          traceAdded: newTrace
                                                         });

            }, 2000);
          }

          return pubsub.asyncIterator(TRACE_ADDED_TOPIC);
        }
      }

    }
}
